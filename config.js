const dotenv = require('dotenv');
const path = require('path');

const root = path.join.bind(this, __dirname);
dotenv.config({ path: root('.env') });

module.exports = {
  PORT: process.env.PORT || 3000,
  MONGO_URL: process.env.MONGO_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  DESTINATION: 'images',
  GMAIL_USER: process.env.GMAIL_USER,
  GMAIL_PASSWORD: process.env.GMAIL_PASSWORD,
  MS_LOGIN: process.env.MS_LOGIN,
  MS_PASSWORD: process.env.MS_PASSWORD,
  LOGIN_SBER: process.env.LOGIN_SBER,
  PASSWORD_SBER: process.env.PASSWORD_SBER,
  TOKEN_SBER: process.env.TOKEN_SBER,
};