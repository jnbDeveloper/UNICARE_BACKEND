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
    return response.success > 0;
  } catch (error) {
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
                if: { $eq: ["$message.seen", false] },
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
    const record = new HealthRecord(req.body);
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

// #endregion

module.exports = router;
