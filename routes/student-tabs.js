const config = require("../config");
const ec = config.errorCodes;

const express = require("express");
const dayjs = require("dayjs");
const isToday = require("dayjs/plugin/isToday");
const utc = require("dayjs/plugin/utc");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const router = express.Router();
const Student = require("../schemas/student");
const Message = require("../schemas/message");
const Doctor = require("../schemas/doctor");
const Appointment = require("../schemas/appointment");
const TimeSlot = require("../schemas/timeslot");
const Notification = require("../schemas/notification");
const Setting = require("../schemas/setting");
const HealthRecord = require("../schemas/health-record");

dayjs.extend(isToday);
dayjs.extend(utc);

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

      const student = await Student.findById(payload.id);

      if (student) {
        req.student = student;
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

const timeToMinutes = (time) => {
  const date = dayjs(time);

  if (date) {
    return date.hour() * 60 + date.minute();
  } else {
    return -1;
  }
};

const isOverlap = (slot, appointment) => {
  const startTime = timeToMinutes(appointment.startTime);
  const endTime = timeToMinutes(appointment.endTime);

  if (
    (startTime >= slot.startTime && startTime < slot.endTime) ||
    (endTime > slot.startTime && endTime <= slot.endTime)
  ) {
    return true;
  } else {
    return false;
  }
};

// #region navigation drawer

router.get("/", verifyJWT, async (req, res) => {
  try {
    const notifications = await Notification.find({
      $and: [{ user: "student" }, { studentId: req.student._id }],
    })
      .limit(50)
      .sort({ createdAt: 1 });

    res.json({
      status: "success",
      student: req.student,
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
    await Notification.deleteMany({
      $and: [{ user: "student" }, { studentId: req.student._id }],
    });

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
  try {
    const doctor = await Doctor.findOne();

    res.json({
      status: "success",
      doctor: doctor,
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
    const messages = await Message.find({ studentId: req.student._id })
      .sort({ createdAt: "ascending" })
      .limit(50);

    const doctor = await Doctor.findOne({});

    req.student.lastSeen = new Date();
    await req.student.save();

    await Message.updateMany(
      { studentId: req.student._id, from: "medical-centre", seen: false },
      { $set: { seen: true } }
    );

    res.json({
      status: "success",
      doctor: doctor,
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

router.post("/emergency/send-message", verifyJWT, async (req, res) => {
  try {
    const message = new Message({
      text: req.body.text,
      studentId: req.student._id,
      from: "student",
      to: "medical-centre",
    });
    await message.save();

    const settings = await Setting.findOne();
    if (settings && settings.emergencyNotifications) {
      const notification = new Notification({
        type: "emergency",
        user: "medical-centre",
        name: `${req.student.firstName} ${req.student.lastName}`,
        image: req.student.image,
        title: "Emergency message",
        content: req.body.text,
      });
      await notification.save();
    }

    const doctor = await Doctor.findOne({});
    if (doctor && doctor.fcmToken) {
      sendNotification({
        to: doctor.fcmToken,
        notification: {
          title: "Message from student",
          body: `${req.student.firstName}: ${req.body.text}`,
        },
        data: {
          task: "emergency",
          _id: req.student._id,
          text: req.body.text,
          fr: "student",
          to: "medical-centre",
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

// #region appointment

router.get("/appointments", verifyJWT, async (req, res) => {
  try {
    const now = new Date();

    const upcomingAppointments = await Appointment.find({
      studentId: req.student._id,
      startTime: { $gte: now },
    });

    const previousAppointments = await Appointment.find({
      studentId: req.student._id,
      endTime: { $lt: now },
    });

    res.json({
      status: "success",
      upcomingAppointments: upcomingAppointments,
      previousAppointments: previousAppointments,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.put("/appointments/add", verifyJWT, async (req, res) => {
  const { timeslotId, description } = req.body;

  let date = dayjs(req.body.date ?? "");

  if (!date.isValid() || !timeslotId || !description) {
    return res.status(ec.badReq).json({
      status: "warning",
      message: "Invalid inputs.",
    });
  }

  date = date.startOf("day");

  try {
    // check upcomming appointments
    const upcomingAppointments = await Appointment.find({
      studentId: req.student._id,
      startTime: { $gte: new Date() },
    });

    if (upcomingAppointments.length >= 3) {
      return res.status(ec.badReq).json({
        status: "warning",
        message: "You have reached maximum upcoming appointments.",
      });
    }

    // check days difference
    if (date.diff(dayjs(), "days") > 20) {
      return res.status(ec.badReq).json({
        status: "warning",
        message: "Please choose a date within 10 days from today.",
      });
    }

    const slot = await TimeSlot.findById(timeslotId);

    if (!slot) {
      return res.status(ec.badReq).json({
        status: "error",
        message: "Invalid time slot.",
      });
    }

    const startTime = date.add(slot.startTime, "minute");
    const endTime = date.add(slot.endTime, "minute");

    const crashAppointments = await Appointment.find({
      $or: [
        { startTime: { $gte: startTime, $lt: endTime } },
        { endTime: { $gt: startTime, $lte: endTime } },
      ],
    });

    if (crashAppointments.length > 0) {
      return res.status(ec.badReq).json({
        status: "warning",
        message:
          "This appointment can crash with other appointment, please try another time.",
      });
    }

    const appointment = new Appointment({
      studentId: req.student._id,
      startTime: startTime.toDate(),
      endTime: endTime.toDate(),
      description: description,
    });
    await appointment.save();

    const settings = await Setting.findOne();
    if (settings && settings.appointmentNotifications) {
      const notification = new Notification({
        type: "appointment",
        user: "medical-centre",
        name: `${req.student.firstName} ${req.student.lastName}`,
        image: req.student.image,
        title: "New appointment",
        content: description,
      });
      await notification.save();
    }

    const doctor = await Doctor.findOne({});
    if (doctor && doctor.fcmToken) {
      sendNotification({
        to: doctor.fcmToken,
        notification: {
          title: "New appointment",
          body: `${req.student.firstName}: ${description}`,
        },
        data: {
          task: "appointment",
        },
      });
    }

    res.json({
      status: "success",
      message: "Appointment added successful.",
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
        message: "Something went wrong.",
        error: error.message,
      });
    }
  }
});

router.get("/appointments/free-slots", async (req, res) => {
  let date = dayjs(req.query.date ?? "");

  if (!date.isValid()) {
    return res.status(ec.badReq).json({
      status: "warning",
      message: "Invalid inputs.",
    });
  }

  const startDate = date.startOf("day");
  const endDate = date.endOf("day");
  const nowMinutes = timeToMinutes(new Date());

  try {
    const appointments = await Appointment.find({
      startTime: {
        $gte: startDate.toDate(),
        $lte: endDate.toDate(),
      },
    });

    let timeSlots;

    if (date.isToday()) {
      timeSlots = await TimeSlot.find({ startTime: { $gte: nowMinutes } });
    } else {
      timeSlots = await TimeSlot.find({});
    }

    let freeSlots = [];

    for (let i = 0; i < timeSlots.length; i++) {
      let isValid = true;
      for (let j = 0; j < appointments.length; j++) {
        if (isOverlap(timeSlots[i], appointments[j])) {
          isValid = false;
          break;
        }
      }
      if (isValid) freeSlots.push(timeSlots[i]);
    }

    res.json({
      status: "success",
      freeSlots: freeSlots,
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

// #region health records

router.get("/health-records", verifyJWT, async (req, res) => {
  try {
    const records = await HealthRecord.find({ studentId: req.student._id });
    const doctor = await Doctor.findOne();

    res.json({
      status: "success",
      records: records,
      doctor: doctor,
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

router.get("/settings", verifyJWT, (req, res) => {
  res.json({
    status: "success",
    emergencyNotifications: req.student.emergencyNotifications,
  });
});

router.put(
  "/settings/toggle/emergency-notifications",
  verifyJWT,
  (req, res) => {
    try {
      req.student.emergencyNotifications = !req.student.emergencyNotifications;
      req.student.save();

      res.json({
        status: "success",
        message: "Emergency notification changed successful.",
        emergencyNotifications: req.student.emergencyNotifications,
      });
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
