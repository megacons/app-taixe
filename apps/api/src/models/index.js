/**
 * Models index - export all Mongoose models
 * Nam Thanh Transport Management System
 *
 * Collections (18):
 * 1. User
 * 2. Driver
 * 3. Vehicle
 * 4. Trip
 * 5. TripImage
 * 6. GPSLog
 * 7. Request (unified: SalaryAdvance, Reward, Discipline, AttendanceAdjustment, Leave, Expense, Purchase, AdditionalTrip)
 * 8. RequestHistory
 * 9. RequestAttachment
 * 10. Notification
 * 11. Material
 * 12. Location
 * 13. SystemConfig
 * 14. Attendance
 * 15. DriverFinance
 */

const User = require('./User');
const Driver = require('./Driver');
const Vehicle = require('./Vehicle');
const Trip = require('./Trip');
const TripImage = require('./TripImage');
const GPSLog = require('./GPSLog');
const Request = require('./Request');
const RequestHistory = require('./RequestHistory');
const RequestAttachment = require('./RequestAttachment');
const Notification = require('./Notification');
const Material = require('./Material');
const Location = require('./Location');
const SystemConfig = require('./SystemConfig');
const Attendance = require('./Attendance');
const DriverFinance = require('./DriverFinance');

module.exports = {
  User,
  Driver,
  Vehicle,
  Trip,
  TripImage,
  GPSLog,
  Request,
  RequestHistory,
  RequestAttachment,
  Notification,
  Material,
  Location,
  SystemConfig,
  Attendance,
  DriverFinance,
};
