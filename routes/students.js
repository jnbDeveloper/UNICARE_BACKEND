const config = require("../config");
const ec = config.errorCodes;

const express = require("express");
const md5 = require("js-md5");
const jwt = require("jsonwebtoken");

const router = express.Router();
const Student = require("../schemas/student");
const Message = require("../schemas/message");

router.post("/signup", async (req, res) => {
  const file = req.files.image;

  if (!file) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Please provide a profile picture.",
    });
  }

  if (file.size > 3145728) {
    return res.status(ec.badReq).json({
      status: "warning",
      message: "Profile picture cannot exceed 3MB.",
    });
  }

  const student = new Student(req.body);

  try {
    await student.save();
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(ec.badReq).json({
        status: "warning",
        message: "Invalid user inputs, please check your data and try again.",
        error: error.message,
      });
    } else if (error.code === 11000) {
      const duplicatedField = Object.keys(error.keyPattern)[0];
      const field =
        duplicatedField === "email"
          ? "email"
          : duplicatedField === "regNo"
          ? "registration number"
          : duplicatedField === "indexNo"
          ? "index number"
          : "phone number";
      return res.status(ec.badReq).json({
        status: "warning",
        message: `You entered a ${field} that already exists.`,
        error: error.message,
      });
    } else {
      return res.status(ec.serverError).json({
        status: "error",
        message: "Signup failed, please try again later.",
        error: error.message,
      });
    }
  }

  const path = `${config.studentDoc}/${student._id}.jpg`;

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
    message: "Signup successful, now you can login to the system.",
    student: student,
  });

  // save data with transaction

  // await Student.db
  //   .transaction(
  //     async function saveImage(session) {
  //       await student.save({ session });

  //       file.mv(path, (error) => {
  //         if (error) {
  //           throw new Error("Couldn't save the profile picture.");
  //         }
  //       });
  //     },
  //     { readPreference: "primary" }
  //   )
  //   .catch((error) => {
  //     return res.json({
  //       status: "error",
  //       message: "Signup failed, please try again later.",
  //       error: error.message,
  //     });
  //   });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Username and password required to login.",
    });
  }

  try {
    const student = await Student.findOne({
      $or: [
        { indexNo: { $regex: "^" + username + "$", $options: "i" } },
        { email: { $regex: "^" + username + "$", $options: "i" } },
      ],
    });

    if (student) {
      if (student.password === md5(password)) {
        const payload = {
          id: student._id,
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

router.get("/current", verifyJWT, async (req, res) => {
  res.json({
    status: "success",
    student: req.student,
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

  const path = `${config.studentDoc}/${req.student._id}.jpg`;

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

router.put("/change-password", verifyJWT, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(ec.badReq).json({
      status: "error",
      message:
        "Current password, new password and confirm password required to change password.",
    });
  }

  if (req.student.password !== md5(currentPassword)) {
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
    req.student.password = md5(newPassword);
    await req.student.save();

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

router.put("/update-general", verifyJWT, async (req, res) => {
  const { firstName, lastName, gender, birthday, phone, email, address, bio } =
    req.body;

  try {
    req.student.firstName = firstName;
    req.student.lastName = lastName;
    req.student.gender = gender;
    req.student.birthday = birthday;
    req.student.phone = phone;
    req.student.email = email;
    req.student.address = address;
    req.student.bio = bio;

    await req.student.save();

    res.json({
      status: "success",
      message: "General information updated successful.",
      student: req.student,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(ec.badReq).json({
        status: "warning",
        message: "Invalid user inputs, please check your data and try again.",
        error: error.message,
      });
    } else if (error.code === 11000) {
      const duplicatedField = Object.keys(error.keyPattern)[0];
      const field =
        duplicatedField === "email"
          ? "email"
          : duplicatedField === "regNo"
          ? "registration number"
          : duplicatedField === "indexNo"
          ? "index number"
          : "phone number";
      res.status(ec.badReq).json({
        status: "warning",
        message: `You entered a ${field} that already exists.`,
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

router.put("/update-reg", verifyJWT, async (req, res) => {
  const { regNo, indexNo, faculty } = req.body;

  try {
    req.student.regNo = regNo;
    req.student.indexNo = indexNo;
    req.student.faculty = faculty;

    await req.student.save();

    res.json({
      status: "success",
      message: "Registration information updated successful.",
      student: req.student,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(ec.badReq).json({
        status: "warning",
        message: "Invalid user inputs, please check your data and try again.",
        error: error.message,
      });
    } else if (error.code === 11000) {
      const duplicatedField = Object.keys(error.keyPattern)[0];
      const field =
        duplicatedField === "email"
          ? "email"
          : duplicatedField === "regNo"
          ? "registration number"
          : duplicatedField === "indexNo"
          ? "index number"
          : "phone number";
      res.status(ec.badReq).json({
        status: "warning",
        message: `You entered a ${field} that already exists.`,
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

router.put("/update-health", verifyJWT, async (req, res) => {
  const { height, weight, bloodGroup, diseases } = req.body;

  try {
    req.student.height = height;
    req.student.weight = weight;
    req.student.bloodGroup = bloodGroup;
    req.student.diseases = diseases;

    await req.student.save();

    res.json({
      status: "success",
      message: "Health information updated successful.",
      student: req.student,
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

router.put("/update-token", verifyJWT, async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(ec.badReq).json({
      status: "error",
      message: "Please provide the firebase cloud messaging token.",
    });
  }

  try {
    req.student.fcmToken = req.body.token;
    await req.student.save();

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
