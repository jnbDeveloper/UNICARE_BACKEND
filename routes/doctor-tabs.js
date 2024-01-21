const config = require("../config");
const ec = config.errorCodes;

const express = require("express");
const jwt = require("jsonwebtoken");

const axios = require("axios");

const router = express.Router();
const Student = require("../schemas/student");
const Doctor = require("../schemas/doctor");
const Message = require("../schemas/message");

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
                if: { $eq: ["$seen", false] },
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

module.exports = router;
