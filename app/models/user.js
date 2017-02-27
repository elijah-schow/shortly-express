var db = require('../config');
var Promise = require('bluebird');
var environment = require('../../env/environment');



var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,
});

module.exports = User;