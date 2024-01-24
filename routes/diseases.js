const config = require("../config");
const ec = config.errorCodes;

const jwt = require("jsonwebtoken");

const express = require("express");
const router = express.Router();
const Disease = require("../schemas/disease");
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

router.get("/all", async (req, res) => {
  const diseases = await Disease.find({});

  return res.json({
    status: "success",
    diseases: diseases,
  });
});

router.put("/add", verifyJWT, async (req, res) => {
  const { disease } = req.body;

  if (!disease) {
    return res
      .status(ec.serverError)
      .json({ status: "error", message: "Invalid inputs." });
  }

  try {
    const newDisease = new Disease({ name: disease });
    await newDisease.save();

    const diseases = await Disease.find({});

    res.json({
      status: "success",
      message: "New disease added successful.",
      diseases: diseases,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(ec.badReq).json({
        status: "warning",
        message: "Invalid user inputs, please check your data and try again.",
        error: error.message,
      });
    } else if (error.code === 11000) {
      return res.status(ec.badReq).json({
        status: "warning",
        message: `You entered a disease that already exists.`,
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

module.exports = router;
