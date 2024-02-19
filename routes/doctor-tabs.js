const config = require("../config");
const ec = config.errorCodes;

const express = require("express");
const dayjs = require("dayjs");

const jwt = require("jsonwebtoken");
const axios = require("axios");

const mongoose = require("mongoose");

const router = express.Router();
const Student = require("../schemas/student");
const Doctor = require("../schemas/doctor");
const Message = require("../schemas/message");
const Appointment = require("../schemas/appointment");
const HealthRecord = require("../schemas/health-record");
const Setting = require("../schemas/setting");
const TimeSlot = require("../schemas/timeslot");
const Notification = require("../schemas/notification");

const sendNotification = async (
  body = {
    to: null,
    notification: {
      title: null,
      body: null,
    },
    data: {},
  }
) => {
  try {
    const response = await axios.post(config.fcmEndpoint, body, {
      headers: {
        Authorization: config.fcmServerKey,
      },
    });
    console.log("Fcm success:", response.data.success, response.data.failure);
    return response.data.success > 0;
  } catch (error) {
    console.log("Fcm error:", error.message);
    return false;
  }
};

const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(ec.unauth).json({
      status: "no-auth",
      message: "Please provide authentication token.",
    });
  }

  try {
    jwt.verify(token, config.privateKey, async (error, payload) => {
      if (error) {
        return res.status(ec.unauth).json({
          status: "no-auth",
          message: "Authentication expired please login again.",
          error: error.message,
        });
      }

      const doctor = await Doctor.findById(payload.id);

      if (doctor) {
        req.doctor = doctor;
        next();
      } else {
        res.status(ec.unauth).json({
          status: "no-auth",
          message: "Invalid student account.",
        });
      }
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
};

// #region navigation drawer

router.get("/", verifyJWT, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: "medical-centre" })
      .limit(50)
      .sort({ createdAt: 1 });

    res.json({
      status: "success",
      doctor: req.doctor,
      notifications: notifications,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.post("/notifications", verifyJWT, async (req, res) => {
  try {
    await Notification.deleteMany({ user: "medical-centre" });

    res.json({
      status: "success",
      message: "Notifications deleted successful.",
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

// #endregion

// #region home

router.get("/home", verifyJWT, async (req, res) => {
  const currentYear = parseInt(dayjs().format("YYYY"));

  try {
    const appointments = await Appointment.aggregate([
      {
        $match: {
          startTime: { $gt: new Date() },
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
          pipeline: [
            {
              $lookup: {
                from: "faculties",
                localField: "faculty",
                foreignField: "_id",
                as: "faculty",
              },
            },
            {
              $unwind: "$faculty",
            },
          ],
        },
      },
      {
        $unwind: "$student",
      },
      {
        $sort: {
          startTime: 1,
        },
      },
      {
        $project: {
          _id: 1,
          startTime: 1,
          endTime: 1,
          description: 1,
          checked: 1,
          checkedAt: 1,
          createdAt: 1,
          firstName: "$student.firstName",
          lastName: "$student.lastName",
          faculty: "$student.faculty.name",
          image: "$student.image",
        },
      },
      {
        $limit: 4,
      },
    ]);

    const graph = await Student.aggregate([
      {
        $lookup: {
          from: "healthrecords",
          localField: "_id",
          foreignField: "studentId",
          as: "records",
        },
      },
      {
        $lookup: {
          from: "faculties",
          localField: "faculty",
          foreignField: "_id",
          as: "faculty",
        },
      },
      {
        $unwind: "$records",
      },
      {
        $unwind: "$faculty",
      },
      {
        $group: {
          _id: {
            faculty: "$faculty",
            year: { $year: "$records.createdAt" },
          },
          students: { $addToSet: "$_id" },
        },
      },
      {
        $group: {
          _id: "$_id.faculty._id",
          faculty: { $first: "$_id.faculty.name" },
          years: {
            $push: {
              year: "$_id.year",
              count: { $size: "$students" },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          faculty: 1,
          years: {
            $map: {
              input: { $range: [currentYear - 4, currentYear + 1] },
              as: "year",
              in: {
                year: "$$year",
                count: {
                  $cond: {
                    if: { $in: ["$$year", "$years.year"] },
                    then: {
                      $let: {
                        vars: {
                          filteredYear: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$years",
                                  as: "yearData",
                                  cond: { $eq: ["$$yearData.year", "$$year"] },
                                },
                              },
                              0,
                            ],
                          },
                        },
                        in: "$$filteredYear.count",
                      },
                    },
                    else: 0,
                  },
                },
              },
            },
          },
        },
      },
    ]);

    res.json({
      status: "success",
      appointments: appointments,
      graph: graph,
      online: req.doctor.online,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.put("/home/status", verifyJWT, async (req, res) => {
  try {
    const data = await Student.aggregate([
      {
        $match: { fcmToken: { $ne: null } },
      },
      {
        $group: {
          _id: "$fcmToken",
        },
      },
      {
        $project: {
          _id: 0,
          fcmToken: "$_id",
        },
      },
    ]);
    const tokens = data.map((item) => item.fcmToken);

    req.doctor.online = !req.doctor.online;
    await req.doctor.save();

    sendNotification({
      registration_ids: tokens,
      notification: {
        title: req.doctor.online ? "Doctor Available" : "Doctor Not Available",
        body: req.doctor.online
          ? "Doctor is in the medical centre."
          : "Doctor is not in the medical centre",
      },
      data: {
        task: "online",
        online: req.doctor.online,
      },
    });

    res.json({
      status: "success",
      message: "Online status changed successful.",
      online: req.doctor.online,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

// #endregion

// #region emergency

router.get("/emergency", verifyJWT, async (req, res) => {
  try {
    const overviews = await Message.aggregate([
      //   {
      //     $match: {
      //       seen: false,
      //     },
      //   },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $unwind: "$student",
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        // $project: {
        //   _id: 0,
        //   text: 1,
        //   "student.firstName": 1,
        //   "student.lastName": 1,
        //   "student.image": 1,
        // },
        $group: {
          _id: "$student._id",
          firstName: { $first: "$student.firstName" },
          lastName: { $first: "$student.lastName" },
          image: { $first: "$student.image" },
          lastSeen: { $first: "$student.lastSeen" },
          lastMsg: {
            $first: {
              text: "$text",
              createdAt: "$createdAt",
            },
          },
          unreadMsgCount: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $eq: ["$seen", false] },
                    { $eq: ["$from", "student"] },
                  ],
                },
                then: 1,
                else: 0,
              },
            },
          },
        },
      },
      {
        $limit: 50,
      },
    ]);

    req.doctor.lastSeen = new Date();
    await req.doctor.save();

    res.json({
      status: "success",
      overviews: overviews,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.get("/emergency/messages", verifyJWT, async (req, res) => {
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Please provide specific student id.",
    });
  }

  try {
    const messages = await Message.find({ studentId: studentId });

    req.doctor.lastSeen = new Date();
    await req.doctor.save();

    await Message.updateMany(
      { studentId: studentId, from: "student", seen: false },
      { $set: { seen: true } }
    );

    res.json({
      status: "success",
      messages: messages,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.get("/emergency/search", verifyJWT, async (req, res) => {
  const { keyWord } = req.query;

  try {
    const overviews = await Student.aggregate([
      {
        $lookup: {
          from: "messages",
          localField: "_id",
          foreignField: "studentId",
          as: "message",
        },
      },
      {
        $match: {
          $or: [
            { firstName: { $regex: keyWord, $options: "i" } },
            { lastName: { $regex: keyWord, $options: "i" } },
            { indexNo: { $regex: keyWord, $options: "i" } },
            { regNo: { $regex: keyWord, $options: "i" } },
          ],
        },
      },
      {
        $unwind: {
          path: "$message",
          preserveNullAndEmptyArrays: Boolean(keyWord),
        },
      },
      {
        $sort: {
          "message.createdAt": -1,
        },
      },
      {
        $group: {
          _id: "$_id",
          firstName: { $first: "$firstName" },
          lastName: { $first: "$lastName" },
          image: { $first: "$image" },
          lastSeen: { $first: "$lastSeen" },
          lastMsg: {
            $first: {
              text: { $ifNull: ["$message.text", null] },
              createdAt: { $ifNull: ["$message.createdAt", null] },
            },
          },
          unreadMsgCount: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $eq: ["$seen", false] },
                    { $eq: ["$from", "student"] },
                  ],
                },
                then: 1,
                else: 0,
              },
            },
          },
        },
      },
      // {
      //   $limit: 50,
      // },
    ]);

    res.json({
      status: "success",
      overviews: overviews,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.post("/emergency/send-message", verifyJWT, async (req, res) => {
  const { studentId, text } = req.body;

  if (!studentId || !text) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Incomplete request parameters",
    });
  }

  try {
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(ec.badReq).json({
        status: "error",
        message: "Couldn't send message, invalid student id.",
      });
    }

    const message = new Message({
      text: text,
      studentId: studentId,
      from: "medical-centre",
      to: "student",
    });

    await message.save();

    if (student.fcmToken) {
      const res = sendNotification({
        to: student.fcmToken,
        notification: {
          title: "Message from doctor",
          body: text,
        },
        data: {
          task: "emergency",
          _id: student._id,
          text: text,
          fr: "medical-centre",
          to: "student",
          createdAt: message.createdAt,
        },
      });
    }

    if (student.emergencyNotifications) {
      const notification = new Notification({
        type: "emergency",
        user: "student",
        studentId: studentId,
        name: `${req.doctor.firstName} ${req.doctor.lastName}`,
        image: req.doctor.image,
        title: "Emergency message",
        content: text,
      });
      await notification.save();
    }

    res.json({
      status: "success",
      message: "Message sent successful.",
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(ec.badReq).json({
        status: "warning",
        message: "Invalid user inputs, please check your data and try again.",
        error: error.message,
      });
    } else {
      res.status(ec.serverError).json({
        status: "error",
        message: "Message send failed, please try again later.",
        error: error.message,
      });
    }
  }
});

// #endregion

// #region appointments

router.get("/appointments", verifyJWT, async (req, res) => {
  const { start, end } = req.query;

  const startDate = dayjs(start);
  const endDate = dayjs(end);

  if (!startDate.isValid() || !endDate.isValid()) {
    return res
      .status(ec.badReq)
      .json({ status: "error", message: "Invalid inputs" });
  }

  try {
    const ap = await Appointment.aggregate([
      {
        $match: {
          startTime: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $unwind: "$student",
      },
      {
        $sort: {
          startTime: 1,
        },
      },
      {
        $project: {
          _id: 1,
          startTime: 1,
          endTime: 1,
          description: 1,
          studentId: 1,
          "student.firstName": 1,
          "student.lastName": 1,
          "student.phone": 1,
          "student.image": 1,
        },
      },
    ]);

    res.json({ status: "success", appointments: ap });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

// #endregion

// #region check patient

router.get("/check-patient", verifyJWT, async (req, res) => {
  const { appointmentId } = req.query;

  const today = dayjs();
  const endDate = today.add(7, "day");

  try {
    const students = await Appointment.aggregate([
      {
        $match: {
          endTime: { $gte: today.toDate(), $lte: endDate.toDate() },
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $unwind: "$student",
      },
      {
        $sort: {
          startTime: 1,
        },
      },
      {
        $group: {
          _id: "$student._id",
          image: { $first: "$student.image" },
          firstName: { $first: "$student.firstName" },
          lastName: { $first: "$student.lastName" },
          bio: { $first: "$student.bio" },
          indexNo: { $first: "$student.indexNo" },
          regNo: { $first: "$student.regNo" },
          onGoingAppointments: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $lte: ["$startTime", new Date()] },
                    { $gt: ["$endTime", new Date()] },
                  ],
                },
                then: 1,
                else: 0,
              },
            },
          },
          upcomingAppointments: {
            $sum: {
              $cond: {
                if: { $gte: ["$startTime", new Date()] },
                then: 1,
                else: 0,
              },
            },
          },
        },
      },
    ]);

    res.json({
      status: "success",
      students: students,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.get("/check-patient/student", verifyJWT, async (req, res) => {
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Invalid inputs.",
    });
  }

  try {
    const students = await Student.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(studentId),
        },
      },
      {
        $lookup: {
          from: "appointments",
          localField: "_id",
          foreignField: "studentId",
          as: "appointments",
        },
      },
      {
        $lookup: {
          from: "faculties",
          localField: "faculty",
          foreignField: "_id",
          as: "faculty",
        },
      },
      {
        $unwind: {
          path: "$appointments",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: "$faculty",
      },
      {
        $group: {
          _id: 0,
          student: {
            $first: {
              _id: "$_id",
              image: "$image",
              firstName: "$firstName",
              lastName: "$lastName",
              bio: "$bio",
              indexNo: "$indexNo",
              regNo: "$regNo",
              faculty: "$faculty.name",
              gender: "$gender",
              height: "$height",
              weight: "$weight",
              bloodGroup: "$bloodGroup",
              birthday: "$birthday",
            },
          },
          ongoingAppointments: {
            $push: {
              $cond: {
                if: {
                  $and: [
                    { $lte: ["$appointments.startTime", new Date()] },
                    { $gte: ["$appointments.endTime", new Date()] },
                  ],
                },
                // then: "$$ROOT",
                then: "$appointments",
                else: "$$REMOVE",
              },
            },
          },
          upcomingAppointments: {
            $push: {
              $cond: {
                if: {
                  $gt: ["$appointments.startTime", new Date()],
                },
                then: "$appointments",
                else: "$$REMOVE",
              },
            },
          },
          previousAppointments: {
            $push: {
              $cond: {
                if: {
                  $lt: ["$appointments.endTime", new Date()],
                },
                then: "$appointments",
                else: "$$REMOVE",
              },
            },
          },
        },
      },
    ]);

    if (students.length > 0) {
      res.json({
        status: "success",
        student: students[0].student,
        ongoingAppointments: students[0].ongoingAppointments,
        upcomingAppointments: students[0].upcomingAppointments,
        previousAppointments: students[0].previousAppointments,
      });
    } else {
      res
        .status(ec.notFound)
        .json({ status: "warning", message: "Student not found." });
    }
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.get("/check-patient/appointment", verifyJWT, async (req, res) => {
  const { appointmentId } = req.query;

  if (!appointmentId) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Invalid inputs.",
    });
  }

  try {
    const appointments = await Appointment.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(appointmentId),
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "students",
          pipeline: [
            {
              $lookup: {
                from: "appointments",
                localField: "_id",
                foreignField: "studentId",
                as: "appointments",
              },
            },
            {
              $lookup: {
                from: "faculties",
                localField: "faculty",
                foreignField: "_id",
                as: "faculties",
              },
            },
            {
              $unwind: {
                path: "$appointments",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $unwind: "$faculty",
            },
            {
              $group: {
                _id: 0,
                student: {
                  $first: {
                    _id: "$_id",
                    image: "$image",
                    firstName: "$firstName",
                    lastName: "$lastName",
                    bio: "$bio",
                    indexNo: "$indexNo",
                    regNo: "$regNo",
                    faculty: "$faculties.name",
                    gender: "$gender",
                    height: "$height",
                    weight: "$weight",
                    bloodGroup: "$bloodGroup",
                    birthday: "$birthday",
                  },
                },
                ongoingAppointments: {
                  $push: {
                    $cond: {
                      if: {
                        $and: [
                          { $lte: ["$appointments.startTime", new Date()] },
                          { $gte: ["$appointments.endTime", new Date()] },
                        ],
                      },
                      // then: "$$ROOT",
                      then: "$appointments",
                      else: "$$REMOVE",
                    },
                  },
                },
                upcomingAppointments: {
                  $push: {
                    $cond: {
                      if: {
                        $gt: ["$appointments.startTime", new Date()],
                      },
                      then: "$appointments",
                      else: "$$REMOVE",
                    },
                  },
                },
                previousAppointments: {
                  $push: {
                    $cond: {
                      if: {
                        $lt: ["$appointments.endTime", new Date()],
                      },
                      then: "$appointments",
                      else: "$$REMOVE",
                    },
                  },
                },
              },
            },
          ],
        },
      },
      {
        $unwind: "$students",
      },
    ]);

    if (appointments.length > 0) {
      res.json({
        status: "success",
        student: appointments[0].students.student,
        ongoingAppointments: appointments[0].students.ongoingAppointments,
        upcomingAppointments: appointments[0].students.upcomingAppointments,
        previousAppointments: appointments[0].students.previousAppointments,
      });
    } else {
      res
        .status(ec.notFound)
        .json({ status: "warning", message: "Student not found." });
    }
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.put("/check-patient/add-record", verifyJWT, async (req, res) => {
  try {
    const data = {
      ...req.body,
      doctorName: `${req.doctor.firstName} ${req.doctor.lastName}`,
      doctorRegNo: req.doctor.mcRegNo,
    };

    const record = new HealthRecord(data);
    await record.save();

    if (req.body.appointmentId) {
      await Appointment.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(req.body.appointmentId) },
        {
          checked: true,
          checkedAt: new Date(),
        }
      );
    }

    res.json({
      status: "success",
      message: "Record saved successful.",
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(ec.badReq).json({
        status: "warning",
        message: "Invalid user inputs, please check your data and try again.",
        error: error.message,
      });
    } else {
      return res.status(ec.serverError).json({
        status: "error",
        message: "Something went wrong.",
        error: error.message,
      });
    }
  }
});

router.get("/check-patient/search", verifyJWT, async (req, res) => {
  const { keyWord } = req.query;

  try {
    const students = await Student.aggregate([
      {
        $match: {
          $or: [
            { firstName: { $regex: keyWord, $options: "i" } },
            { lastName: { $regex: keyWord, $options: "i" } },
            { indexNo: { $regex: keyWord, $options: "i" } },
            { regNo: { $regex: keyWord, $options: "i" } },
          ],
        },
      },
      {
        $lookup: {
          from: "appointments",
          localField: "_id",
          foreignField: "studentId",
          as: "appointments",
        },
      },
      {
        $lookup: {
          from: "faculties",
          localField: "faculty",
          foreignField: "_id",
          as: "faculty",
        },
      },
      {
        $unwind: {
          path: "$appointments",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: "$faculty",
      },
      {
        $group: {
          _id: "$_id",
          image: { $first: "$image" },
          firstName: { $first: "$firstName" },
          lastName: { $first: "$lastName" },
          bio: { $first: "$bio" },
          indexNo: { $first: "$indexNo" },
          regNo: { $first: "$regNo" },
          onGoingAppointments: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $lte: ["$startTime", new Date()] },
                    { $gt: ["$endTime", new Date()] },
                  ],
                },
                then: 1,
                else: 0,
              },
            },
          },
          upcomingAppointments: {
            $sum: {
              $cond: {
                if: { $gte: ["$startTime", new Date()] },
                then: 1,
                else: 0,
              },
            },
          },
        },
      },
    ]);

    res.json({
      status: "success",
      students: students,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.get("/check-patient/records", verifyJWT, async (req, res) => {
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(ec.badReq).json({
      status: "warning",
      message: "Invalid inputs.",
      error: error.message,
    });
  }

  try {
    const records = await HealthRecord.find({
      studentId: new mongoose.Types.ObjectId(studentId),
    }).sort({ createdAt: -1 });

    res.json({
      status: "success",
      records: records,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

// #endregion

// #region analisys

router.get("/analysis", verifyJWT, async (req, res) => {
  const currentYear = parseInt(dayjs().format("YYYY"));

  try {
    const chart1 = await HealthRecord.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $year: "$createdAt" }, currentYear],
          },
        },
      },
      {
        $group: {
          _id: "$disease",
          students: { $addToSet: "$studentId" },
        },
      },
      {
        $project: {
          _id: 0,
          disease: "$_id",
          count: {
            $size: "$students",
          },
        },
      },
    ]);

    const chart2 = await Student.aggregate([
      {
        $lookup: {
          from: "healthrecords",
          localField: "_id",
          foreignField: "studentId",
          as: "records",
        },
      },
      {
        $lookup: {
          from: "faculties",
          localField: "faculty",
          foreignField: "_id",
          as: "faculty",
        },
      },
      {
        $unwind: "$records",
      },
      {
        $unwind: "$faculty",
      },
      {
        $group: {
          _id: {
            faculty: "$faculty",
            year: { $year: "$records.createdAt" },
          },
          students: { $addToSet: "$_id" },
        },
      },
      {
        $group: {
          _id: "$_id.faculty._id",
          faculty: { $first: "$_id.faculty.name" },
          years: {
            $push: {
              year: "$_id.year",
              count: { $size: "$students" },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          faculty: 1,
          years: {
            $map: {
              input: { $range: [currentYear - 4, currentYear + 1] },
              as: "year",
              in: {
                year: "$$year",
                count: {
                  $cond: {
                    if: { $in: ["$$year", "$years.year"] },
                    then: {
                      $let: {
                        vars: {
                          filteredYear: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$years",
                                  as: "yearData",
                                  cond: { $eq: ["$$yearData.year", "$$year"] },
                                },
                              },
                              0,
                            ],
                          },
                        },
                        in: "$$filteredYear.count",
                      },
                    },
                    else: 0,
                  },
                },
              },
            },
          },
        },
      },
    ]);

    const chart3 = await HealthRecord.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $year: "$createdAt" }, currentYear],
          },
        },
      },
      {
        $group: {
          _id: "$studentId",
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "_id",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $unwind: "$student",
      },
      {
        $group: {
          _id: "$student.faculty",
          male: {
            $sum: {
              $cond: {
                if: {
                  $eq: ["$student.gender", "male"],
                },
                then: 1,
                else: 0,
              },
            },
          },
          female: {
            $sum: {
              $cond: {
                if: {
                  $eq: ["$student.gender", "female"],
                },
                then: 1,
                else: 0,
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: "faculties",
          localField: "_id",
          foreignField: "_id",
          as: "faculty",
        },
      },
      {
        $unwind: "$faculty",
      },
      {
        $project: {
          _id: 0,
          faculty: "$faculty.name",
          male: 1,
          female: 1,
        },
      },
    ]);

    res.json({
      status: "success",
      chart1: chart1,
      chart2: chart2,
      chart3: chart3,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

// #endregion

// #region settings

router.get("/settings", verifyJWT, async (req, res) => {
  try {
    const slots = await TimeSlot.find({}).sort({ startTime: 1 });
    const settings = await Setting.findOne();

    res.json({
      status: "success",
      slots: slots,
      settings: settings,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.put(
  "/settings/toggle/appointment-notifications",
  verifyJWT,
  async (req, res) => {
    try {
      const settings = await Setting.findOne();

      if (settings) {
        settings.appointmentNotifications = !settings.appointmentNotifications;
        settings.save();

        res.json({
          status: "success",
          message: "Appointment notification settings changed successful.",
          appointmentNotifications: settings.appointmentNotifications,
        });
      } else {
        res.status(ec.notFound).json({
          status: "error",
          message: "Settings not found.",
        });
      }
    } catch (error) {
      res.status(ec.serverError).json({
        status: "error",
        message: "Something went wrong.",
        error: error.message,
      });
    }
  }
);

router.put(
  "/settings/toggle/emergency-notifications",
  verifyJWT,
  async (req, res) => {
    try {
      const settings = await Setting.findOne();

      if (settings) {
        settings.emergencyNotifications = !settings.emergencyNotifications;
        settings.save();

        res.json({
          status: "success",
          message: "Emergency notification settings changed successful.",
          emergencyNotifications: settings.emergencyNotifications,
        });
      } else {
        res.status(ec.notFound).json({
          status: "error",
          message: "Settings not found.",
        });
      }
    } catch (error) {
      res.status(ec.serverError).json({
        status: "error",
        message: "Something went wrong.",
        error: error.message,
      });
    }
  }
);

// #endregion

module.exports = router;
