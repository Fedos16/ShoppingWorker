const fs = require('fs');
var {google} = require('googleapis');
const readline = require('readline');

const config = require('../config');
const nodemailer = require('nodemailer');
const axios = require('axios');


function MoneyFormat(number) {
    let money = String(number);
    return (money.replace(/(\d)(?=(\d\d\d)+([^\d]|$))/g, '$1 ')).replace(' руб.', '');
}
var TextDateToDate = (textDate) => {
    let len = textDate.length;
    if (len < 10 && textDate != '') {
        let arr = String(textDate).split('.');
        let day = arr[0];
        let month = arr[1];
        let year = arr[2];
        if (day.length < 2) {
            day = '0' + day;
        }
        if (month.length < 2) {
            month = '0' + month;
        }
        if (year.length < 4) {
            year = '20'+year;
        }
        textDate = `${day}.${month}.${year}`;
    }
    let typeDev = config.IS_PRODUCTION;
    let h=3;
    if (!typeDev) {
        h=3;
    }
    return new Date(textDate.substr(6, 4), textDate.substr(3, 2)-1, textDate.substr(0, 2), h, 0, 0, 0);
}
var DateInString = (date) => {
    var dateS = new Date(date);
    var day = dateS.getDate();
    var month = dateS.getMonth()+1;
    var year = dateS.getFullYear();
    if (day < 10) day = '0'+day;
    if (month < 10) month = '0'+month;

    return `${day}.${month}.${year}`
}
var TimeInString = (date) => {
    let dateS = new Date(date);
    let hours = dateS.getHours();
    let minutes = dateS.getMinutes();
    if (hours < 10) hours = '0'+hours;
    if (minutes < 10) minutes = '0'+minutes;

    return `${hours}:${minutes}`
}
let valideDate = (date) => {
    let pattern = /[0-9]{4}-[0-9]{2}-[0-9]{2}/;
    if (date == null || date == "" || !pattern.test(date)) {
        return false;
    }
    else {
        return true
    }
}
let formatDate = (date) => {
    let arrDate = date.split('-');
    let year = arrDate[0];
    let month = arrDate[1];
    let day = arrDate[2];

    let newDate = new Date(year, month-1, day, 3, 0, 0, 0);

    return newDate;
}
var RUB = (rubb) => {
    let rub = String(rubb);
    let retRub = rub.replace(' руб.', '').replace(/ /g, '');
    return Number(retRub);
};
// Функция авторизации в гугл
const GoogleSheets = async (listMajors) => {
    // АВТОРИЗАЦИЯ В ГУГЛ ТАБЛИЦАХ И ЗАПРОС ДАННЫХ
    const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
    const TOKEN_PATH = 'token.json';
    fs.readFile('credentials.json', (err, content) => {
        if (err) return console.log('Error loading client secret file:', err);

        authorize(JSON.parse(content), listMajors);
    });
    function authorize(credentials, callback) {
        const {client_secret, client_id, redirect_uris} = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);
        fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
        });
    }
    function getNewToken(oAuth2Client, callback) {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        console.log('Authorize this app by visiting this url:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
            if (err) console.error(err);
            console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
        });
    }
}

async function sendEmail(params) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: config.GMAIL_USER,
            pass: config.GMAIL_PASSWORD,
        },
    });

    await transporter.sendMail({
        from: '"MarusikShop" <o.fedin96@gmail.com>',
        to: params.email,
        subject: params.subject,
        html: params.text
    });
}
function isTelephone(tel) {

    tel = String(tel).replace(/\D/g, '');

    return tel.length == 11;

}
async function setRequestForMySklad(url) {
    let request = await axios.get(url, { auth: { username: config.MS_LOGIN, password: config.MS_PASSWORD } });
    return request.data;
}
async function newClientForMySklad(info) {
    let tel = info.tel;
    tel = tel.replace(/\D/g, '');
    tel = String(tel).substring(1);

    let url = `${config.MS_URL}/counterparty?search=${tel}`;
    let request = await setRequestForMySklad(url);
    if (request.rows.length == 0) {
        let createCounterPartyUrl = `${config.MS_URL}/counterparty`;
        let data = {
            "name": info.fio,
            "phone": info.tel,
            "email": info.email,
            "attributes": [
                {
                    "id": "9d6ea88b-02aa-11e9-9ff4-3150002312fb",
                    "name": "Ник в Instagram",
                    "type": "string",
                    "value": info.nik
                }
            ]
        }

        await axios.post(createCounterPartyUrl, data, {
            headers: {'Content-Type': 'application/json'},
            auth: { username: config.MS_LOGIN, password: config.MS_PASSWORD }
        }).then(ok => {
            console.log('Контагент создан (reg new user)');
        }).catch(function(error) {
            console.log(error);
        });

    } else {
        console.log('Контрагент существует (reg new user) ...');
    }
}

module.exports = {
    TextDateToDate, DateInString, TimeInString, valideDate, formatDate, RUB, GoogleSheets,
    sendEmail, isTelephone, setRequestForMySklad, newClientForMySklad, MoneyFormat
}