const config = require("./config");

const express = require("express");
const cors = require("cors");
const mongoose = require("./db");
const fileUpload = require("express-fileupload");

const app = express();

// enable cors - if not cannot access from origin localhost:3000
app.use(
  cors({
    origin: ["http://localhost:3000", "http://192.168.43.180:3000"], // whitelist specific origins
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true, // enable credentials (cookies, http authentication) cross-origin
    optionsSuccessStatus: 204,
  })
);

// to access request body json
app.use(express.json());

// enable public folder
app.use("/public", express.static("public"));

// enable file upload
app.use(fileUpload());

// routes
const studentsRouter = require("./routes/students");
const doctorsRouter = require("./routes/doctors");
const studentTabsRouter = require("./routes/student-tabs");
const doctorTabRouter = require("./routes/doctor-tabs");

const facultiesRouter = require("./routes/faculties");
const timeslotsRouter = require("./routes/timeslots");

// set routes
app.use("/students", studentsRouter);
app.use("/doctors", doctorsRouter);
app.use("/tabs/students", studentTabsRouter);
app.use("/tabs/doctors", doctorTabRouter);

app.use("/faculties", facultiesRouter);
app.use("/timeslots", timeslotsRouter);

app.listen(config.port, config.hostname, () => {
  console.log(`Server is running on http://${config.hostname}:${config.port}`);
});
