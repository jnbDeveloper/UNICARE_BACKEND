const config = require("../config");
const mongoose = require("mongoose");
const md5 = require("js-md5");

const studentSchema = new mongoose.Schema(
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
    address: {
      type: String,
      required: true,
      maxlength: 200,
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
    regNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      maxlength: 30,
    },
    indexNo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      maxlength: 20,
    },
    faculty: {
      type: mongoose.Schema.ObjectId,
      ref: "Faculty",
      required: true,
    },
    height: {
      type: Number,
      required: true,
      min: 0.0,
      max: 300.0,
    },
    weight: {
      type: Number,
      required: true,
      min: 0.0,
      max: 500.0,
    },
    bloodGroup: {
      type: String,
      required: true,
      enum: ["a+", "a-", "b+", "b-", "o+", "o-", "ab+", "ab-"],
    },
    diseases: {
      type: String,
      default: null,
      maxlength: 1000,
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

studentSchema.pre("save", function (next) {
  if (this.isModified("password")) {
    this.password = md5(this.password);
  }
  if (this.isModified("height")) {
    this.height = parseFloat(this.height.toFixed(2));
  }
  if (this.isModified("weight")) {
    this.weight = parseFloat(this.weight.toFixed(2));
  }
  this.image = `${config.studentDocLink}/${this._id}.jpg`;
  next();
});

module.exports = mongoose.model("Student", studentSchema);
