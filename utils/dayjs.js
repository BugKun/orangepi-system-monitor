const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)


module.exports = (day) => dayjs(day).utcOffset(8)