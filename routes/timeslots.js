const config = require("../config");
const ec = config.errorCodes;

const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const TimeSlot = require("../schemas/timeslot");
const Doctor = require("../schemas/doctor");

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
          message: "Invalid doctor account.",
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

router.delete("/", verifyJWT, async (req, res) => {
  const { _id } = req.query;

  if (!_id) {
    return res.status(ec.badReq).json({
      status: "warning",
      message: "Invalid inputs.",
    });
  }
  try {
    await TimeSlot.findByIdAndDelete(_id);
    res.json({
      status: "success",
      message: "Time slot deleted successful.",
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const slots = await TimeSlot.find({}).sort({ startTime: 1 });
    res.json({
      status: "success",
      slots: slots,
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.put("/add", verifyJWT, async (req, res) => {
  const { startTime, endTime } = req.body;

  if (!startTime || !endTime) {
    return res.status(ec.badReq).json({
      status: "warning",
      message: "Invalid inputs.",
    });
  }

  try {
    const crashSlots = await TimeSlot.find({
      $or: [
        { startTime: { $gte: startTime, $lt: endTime } },
        { endTime: { $gt: startTime, $lte: endTime } },
      ],
    });

    if (crashSlots.length > 0) {
      return res.status(ec.badReq).json({
        status: "warning",
        message: "Time slots cannot be overlap.",
      });
    }

    const timeSlot = new TimeSlot({ startTime: startTime, endTime: endTime });
    await timeSlot.save();

    res.json({ status: "success", message: "Time slot added successful." });
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
        message: "Time slot add failed, please try again later.",
        error: error.message,
      });
    }
  }
});

module.exports = router;
