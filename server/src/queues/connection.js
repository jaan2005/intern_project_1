const IORedis = require('ioredis');
const { redisUrl } = require('../config/env');

// BullMQ requires maxRetriesPerRequest: null on its Redis connections
const makeConnection = () => new IORedis(redisUrl, { maxRetriesPerRequest: null });
module.exports = { makeConnection };
