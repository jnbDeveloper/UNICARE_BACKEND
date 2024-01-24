const fs = require("fs");

const port = 8000;
const hostname = "localhost";
const dbServer = "mongodb://localhost:27017";
const db = "unicare";
const privateKey = fs.readFileSync("private.key", "utf8");

const studentDoc = `public/students`;
const studentDocLink = `http://${hostname}:${port}/${studentDoc}`;

const doctorDoc = `public/doctor`;
const doctorDocLink = `http://${hostname}:${port}/${doctorDoc}`;

const fcmEndpoint = "https://fcm.googleapis.com/fcm/send";
const fcmServerKey =
  "key=AAAAELXcoVg:APA91bG2tAFwHxpXxoi6AeafA8_WyH7_31xksZ_T2WWsootvZ75-ZG4fwuW_9HUZGQKWb1mts6vgnmsAOyQxpTLinfDVgXbiKRgFVi7GhKNp3yoLUJUMvz5UINrtgRTX6ClVbzI_T8YV";

const errorCodes = {
  success: 200,
  created: 201,
  accepted: 202,
  badReq: 400,
  unauth: 401,
  forbidden: 403,
  notFound: 404,
  serverError: 500,
};

module.exports = {
  port,
  hostname,
  dbServer,
  db,
  studentDoc,
  studentDocLink,
  doctorDoc,
  doctorDocLink,
  privateKey,
  errorCodes,
  fcmEndpoint,
  fcmServerKey,
};
