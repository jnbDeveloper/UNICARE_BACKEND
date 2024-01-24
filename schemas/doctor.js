const config = require("../config");
const mongoose = require("mongoose");
const md5 = require("js-md5");

const doctorSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      maxlength: 30,
    },
    lastName: {
      type: String,
      required: true,
      maxlength: 30,
    },
    gender: {
      type: String,
      required: true,
      enum: ["male", "female"],
    },
    birthday: {
      type: Date,
      required: true,
      min: "1980-01-01",
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      maxlength: 10,
      minlength: 10,
      validate: {
        validator: (value) => /^0\d{9}$/.test(value),
        message: "Invalid phone number",
      },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      maxlength: 50,
      validate: {
        validator: (value) => /^\S+@\S+\.\S+$/.test(value),
        message: "Invalid email address",
      },
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 50,
    },
    bio: {
      type: String,
      required: true,
      maxlength: 500,
      minlength: 100,
    },
    image: {
      type: String,
      default: null,
      maxlength: 200,
    },
    mcRegNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      maxlength: 50,
    },
    specialize: {
      type: String,
      default: null,
      maxlength: 100,
    },
    fcmToken: {
      type: String,
      default: null,
      maxlength: 500,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      immutable: true,
      default: () => Date.now(),
    },
  },
  {
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
      },
    },
  }
);

doctorSchema.pre("save", function (next) {
  if (this.isModified("password")) {
    this.password = md5(this.password);
  }
  this.image = `${config.doctorDocLink}/${this._id}.jpg`;
  next();
});

module.exports = mongoose.model("Doctor", doctorSchema);
