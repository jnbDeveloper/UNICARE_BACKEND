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

    const doctor = await Doctor.findOne({});

    if (doctor.fcmToken) {
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
    const now = dayjs();

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
    const upcomingAppointments = await Appointment.find({
      studentId: req.student._id,
      startTime: { $gte: dayjs() },
    });

    if (upcomingAppointments.length >= 3) {
      return res.status(ec.badReq).json({
        status: "warning",
        message: "You have reached maximum upcoming appointments.",
      });
    }

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
      date: date.format("YYYY-MM-DD"),
      startTime: startTime,
      endTime: endTime,
      description: description,
    });
    await appointment.save();

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

  date = date.startOf("day");
  const nowMinutes = timeToMinutes(dayjs().format());

  try {
    const appointments = await Appointment.find({
      date: { $eq: date.format("YYYY-MM-DD") },
    });

    let timeSlots;
    if (date.isToday())
      timeSlots = await TimeSlot.find({ startTime: { $gte: nowMinutes } });
    else timeSlots = await TimeSlot.find({});

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

module.exports = router;
