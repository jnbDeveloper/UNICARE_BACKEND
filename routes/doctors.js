const config = require("../config");
const ec = config.errorCodes;

const express = require("express");
const md5 = require("js-md5");
const jwt = require("jsonwebtoken");

const router = express.Router();
const Doctor = require("../schemas/doctor");

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Username and password required to login.",
    });
  }

  try {
    const doctor = await Doctor.findOne({
      $or: [{ email: { $regex: "^" + username + "$", $options: "i" } }],
    });

    if (doctor) {
      if (doctor.password === md5(password)) {
        const payload = {
          id: doctor._id,
        };
        const token = jwt.sign(payload, config.privateKey, {
          algorithm: "RS256",
          expiresIn: "2 days",
        });
        res.json({
          status: "success",
          message: "Login successful.",
          token: token,
        });
      } else {
        res.status(ec.unauth).json({
          status: "warning",
          message: "You provided password not match for this account.",
        });
      }
    } else {
      res.status(ec.unauth).json({
        status: "warning",
        message: "There is no account under the username you provided.",
      });
    }
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

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

router.get("/current", verifyJWT, async (req, res) => {
  res.json({
    status: "success",
    doctor: req.doctor,
  });
});

router.post("/change-dp", verifyJWT, (req, res) => {
  const file = req.files.image;

  if (!file) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Please provide a profile picture.",
    });
  }

  if (file.size > 3145728) {
    return res.status(500).json({
      status: "warning",
      message: "Profile picture cannot exceed 3MB.",
    });
  }

  const path = `${config.doctorDoc}/${req.doctor._id}.jpg`;

  file.mv(path, (error) => {
    if (error) {
      return res.status(ec.serverError).json({
        status: "error",
        message: "Couldn't save the profile picture.",
        error: error.message,
      });
    }
  });

  res.json({
    status: "success",
    message: "Profile picture changed successful.",
  });
});

router.put("/update-general", verifyJWT, async (req, res) => {
  const { firstName, lastName, gender, birthday, phone, email, bio } = req.body;

  try {
    req.doctor.firstName = firstName;
    req.doctor.lastName = lastName;
    req.doctor.gender = gender;
    req.doctor.birthday = birthday;
    req.doctor.phone = phone;
    req.doctor.email = email;
    req.doctor.bio = bio;

    await req.doctor.save();

    res.json({
      status: "success",
      message: "General information updated successful.",
      doctor: req.doctor,
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
        message: "Update failed, please try again later.",
        error: error.message,
      });
    }
  }
});

router.put("/update-pro", verifyJWT, async (req, res) => {
  const { mcRegNo, specialize } = req.body;

  try {
    req.doctor.mcRegNo = mcRegNo;
    req.doctor.specialize = specialize;

    await req.doctor.save();

    res.json({
      status: "success",
      message: "Professional information updated successful.",
      doctor: req.doctor,
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
        message: "Update failed, please try again later.",
        error: error.message,
      });
    }
  }
});

router.put("/change-password", verifyJWT, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(ec.badReq).json({
      status: "error",
      message:
        "Current password, new password and confirm password required to change password.",
    });
  }

  if (req.doctor.password !== md5(currentPassword)) {
    return res.status(ec.badReq).json({
      status: "warning",
      message: "Current password is incorrect.",
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(ec.badReq).json({
      status: "warning",
      message: "New password and confirm password must same.",
    });
  }

  try {
    req.doctor.password = md5(newPassword);
    await req.doctor.save();

    res.json({
      status: "success",
      message: "Password changed successful.",
    });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

router.put("/update-token", verifyJWT, async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Please provide the firebase cloud messaging token.",
    });
  }

  try {
    req.doctor.fcmToken = req.body.token;
    await req.doctor.save();

    res.json({ status: "success", message: "Token saved successful." });
  } catch (error) {
    res.status(ec.serverError).json({
      status: "error",
      message: "Something went wrong.",
      error: error.message,
    });
  }
});

module.exports = router;
