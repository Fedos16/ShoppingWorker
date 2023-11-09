const express = require('express');

const cron = require('node-cron');
var { google } = require('googleapis');

const axios = require('axios')

const mongoose = require('mongoose');
const MongoClient = require('mongodb').MongoClient;

const config = require('./config');
const models = require('./models');
const mainFunctions = require('./helpers/index');

const axiosParamsForMS = {
    headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
    },
    auth: { username: config.MS_LOGIN, password: config.MS_PASSWORD }
}

// database
mongoose.Promise = global.Promise;
const options = {
  socketTimeoutMS: 30000,
  keepAlive: true,
  useUnifiedTopology: true,
  useNewUrlParser: true,
  useUnifiedTopology: true
}
mongoose.set('debug', !config.IS_PRODUCTION);
mongoose.connection
  .on('error', error => console.error(error))
  .on('close', () => console.log('Database connection closed.'))
  .once('open', async () => {
    const info = mongoose.connections[0];
    console.log(`Connected to ${info.host}:${info.port}/${info.name}`);
  });

mongoose.connect(config.MONGO_URL, options);

// express
const app = express();

app.get('/', (req, res) => {
    res.send('Привет. Я Worker, который работает круглосуточно.<br>По четным минутам я забираю данные из Google Sheets.<br>По нечетным минутам я записываю результаты продаж в Google Sheets и Мой Склад')
})

async function sucPayment() {

    let login = config.LOGIN_SBER;
    let pasw = config.PASSWORD_SBER;
    let data = await models.Shop.find({ status: 'Регистрация оплаты' }).lean();

    for (let row of data){
        let order = row.numOrder;
        let id = row._id;
        let sberStatus = await axios.get(`https://securecardpayment.ru/payment/rest/getOrderStatusExtended.do?userName=${login}&password=${pasw}&orderNumber=${order}`);
        if (sberStatus.data.orderStatus == 2){
            await models.Shop.findOneAndUpdate({ _id: id }, { status: 'Оплачено - не записано', 'serviceStatus.payment': true });
        } else {
            if ('orderStatus' in sberStatus.data) {
                if (sberStatus.data.orderStatus == 6) {
                    await models.Shop.findOneAndUpdate({ _id: id }, { status: 'Авторизация отклонена' });
                }
            } else {
                await models.Shop.findOneAndUpdate({ _id: id }, { status: 'Не найден в Сбербанке' });
            }
        }
    }

}
async function mailingOfLetters() {

    const main_url = `http://marusik.shop/deliveryinfo`

    let orders = await models.SheetData.find({ status: 'Не оплачено' }, { nik: 1, purchase: 1, amount: 1, numberProduct: 1 });

    let arr = {};
    for (let row of orders) {
        let nik = String(row.nik).trim().toLowerCase().split(' ')[0];
        let name_order = row.purchase;
        let sum = Number(row.amount);
        let number = Number(row.numberProduct);

        let _id = row._id;
        if (nik in arr) {
            if (name_order in arr[nik]) {
                arr[nik][name_order].sum += sum;
                arr[nik][name_order].number += number;
            } else {
                arr[nik][name_order] = { sum, number, _id };
            }
        } else {
            arr[nik] = {};
            arr[nik][name_order] = { sum, number, _id };
        }
    }

    let users = await models.Client_Test.find({ 'PersonalData.Instagram': { $in: Object.keys(arr) } }, { 'PersonalData': 1 });
    let arr_mail = [];

    for (let row of users) {
        let nik = row.PersonalData.Instagram;
        let email = row.PersonalData.Email;
        let name_user = row.PersonalData.FirstName;

        if (nik in arr) {
            let keys = Object.keys(arr[nik]);
            let orders = [];
            for (let key of keys) {
                let sum = arr[nik][key].sum;
                let number = arr[nik][key].number;
                let _id = arr[nik][key]._id;
                orders.push({ name: key, _id, number, sum });
            }
            arr_mail.push({ email, name_user, orders });
        }
    }

    const sendEmail = mainFunctions.sendEmail;
    const MoneyFormat = mainFunctions.MoneyFormat;

    for (let row of arr_mail) {

        let orders = row.orders;

        let code_products = '';
        for (let row of orders) {
            let url_pay = `${main_url}/${row._id}`;
            code_products += `<p>Закупка: <b>${row.name}</b></p>
            <p>Товаров: <b>${row.number} шт.</b></p>
            <p>Сумма: <b>${MoneyFormat(row.sum)} руб.</b></p>
            <p>Перейдите для оплаты: <a href="${url_pay}">Ссылка для оплаты</a></p><br>`
        }

        let email = row.email;
        let subject = 'Неоплаченные заказы';
        let text = `<b>Здравствуйте, ${row.name_user}. Это компания MarusikShop</b>
        <br><br><p>У вас имееются <b>неоплаченные заказы</b>:</p><br>
        ${code_products}
        <p>С уважением, Команда СП Marusik!</p>
        <br><br><p>Если вы считаете, что получили письмо по ошибке, проигнорируйте его</p>`;
        
        await sendEmail({ email, subject, text });
    }

    console.log(`Все письма (${arr_mail.length}) отправлены ...`);

}
async function removeSession(id) {
    let urlMongo = config.MONGO_URL;
    let dbName = 'shopping';
    let status = true;
    MongoClient.connect(urlMongo, async (err, client) => {
        if (err) {
            console.error(err);
            status = false;
        }

        let db = client.db(dbName);
        const collection = db.collection('sessions');

        await collection.findOneAndDelete({ session: { $regex: `${id}` }})
    });

    return status;
}
// E-mail рассылка
/* cron.schedule('00 10 * * *', async () => {
    await mailingOfLetters();
}); */

// Проверка верификации аккаунтов
//cron.schedule('*/30 * * * *', async () => {
    /*let lats_two_hours = new Date();
    lats_two_hours.setHours(lats_two_hours.getHours() - 2);
    const users = await models.Client_Test.find({ createdAt: { $lte: lats_two_hours }, 'Security.Verification.Status': false }, 
    { Login: 1 });

    let logins = [];
    for (let row of users) {
        await removeSession(row._id);
        logins.push(row.Login);
    }

    await models.Client_Test.deleteMany({ createdAt: { $lte: lats_two_hours }, 'Security.Verification.Status': false });
    await models.User_Test.deleteMany({ Login: { $in: logins } });

    console.log(` - Удалено пользователей: ${users.length}`);

}); */

async function getGoogleData() {
    let GoogleSheets = mainFunctions.GoogleSheets;

    const listException = [
        'УЧАСТНИКИ ЧС',
        'ОПЛАТА',
        'Оплата тест'
    ];

    const numberForBatchGet = 70;

    const start = new Date();

    await GoogleSheets(async auth => {
        try {

            const id_table = '1HGsuKdWEIcYjqWib2a5ApI-txNtybNl8Z0oR6ZPR59U';
        
            const sheet = google.sheets({ version: 'v4', auth });
            const spreadsheet = await sheet.spreadsheets.get({ spreadsheetId: id_table });
        
            let sheets_arr = spreadsheet.data.sheets;
            const sheets = [];

            let index = 0;
            for (let row of sheets_arr) {
                let name = row.properties.title;
                if (!listException.includes(name)) {

                    const number = Math.trunc(index / numberForBatchGet);

                    if (sheets.length - 1 < number) sheets.push([]);

                    sheets[number].push(`${name}!A2:H`);

                    index ++;
                }
            }

            const valueRanges = [];

            for (let arr of sheets) {
                let sheets_data = await sheet.spreadsheets.values.batchGet({
                    spreadsheetId: id_table,
                    ranges: arr
                });

                valueRanges.push(...sheets_data.data.valueRanges);
            }
        
            let no_pays = [];

            for (let rw of valueRanges) {

                let name = rw.range.split("'")[1];

                let values = rw.values;
                if (!values) continue;
                for (let row of values) {
                    let status = String(row[6]).toLowerCase();
                    
                    if (status == 'не оплачено') {

                        const nik = String(row[0]).toLowerCase();
                        const amount = String(row[5]).replace(',', '.').replace(/ /g, '');

                        no_pays.push({
                            purchase: name,
                            nik: nik,
                            venCode: row[1],
                            nameProduct: row[2],
                            numberProduct: row[3],
                            variantProduct: row[4],
                            amount: amount,
                            status: row[6],
                            sumDelivery: 0
                        })
                    }
                }
            }
            console.log(`Data from Google Sheets upload in: ${new Date() - start} ms`);
        
            let orders = await models.SheetData.find({ status: 'Не оплачено' });
        
            let start_n = new Date();
        
            let new_arr = [];
            let remove_arr = [];

            let arr_change = [];

            for (let row of orders) {
                let status = true;
                for (let rw of no_pays) {
                    if (row.purchase == rw.purchase && row.nik == rw.nik && row.nameProduct == rw.nameProduct && row.venCode == rw.venCode) {

                        let num = row.numberProduct;
                        let price = row.amount;
                        let varian = row.variantProduct;

                        if (num != rw.numberProduct || price != rw.amount || varian != rw.variantProduct) {
                            arr_change.push({ _id: row._id, data: rw });
                        }

                        status = false;
                        break;
                    }
                }
                if (status) remove_arr.push(row._id);
            }
        
            for (let rw of no_pays) {
                let status = true;
                for (let row of orders) {
                    if (row.purchase == rw.purchase && row.nik == rw.nik && row.nameProduct == rw.nameProduct) {
                        status = false;
                        break;
                    }
                }
                if (status) new_arr.push(rw);
            }
        
            console.log(` -- Rows read in: ${new Date() - start_n} ms`);
            console.log(`Arrays: Remove - ${remove_arr.length}, Add - ${new_arr.length}, CHANGE: ${arr_change.length}`);

            for (let row of arr_change) {
                await models.SheetData.findOneAndUpdate({ _id: row._id }, row.data);
            }
        
            await models.SheetData.deleteMany({ _id: { $in: remove_arr } });
            await models.SheetData.insertMany(new_arr);
        
            console.log(` -- Update completed in: ${new Date() - start} ms`);
        } catch(e) {
            console.error(e);
        }
    
    });
}
async function setDataForGoogleAndMS() {
    async function create_ms_order({ _id, ms_sumOrder, ms_street, ms_home, ms_room, ms_purchase, ms_idProduct, ms_numOrder, counterparty, ms_delivery, ms_delivery_address, ms_city, ms_index }) {
        try {
            // search order in moysklad
            const res = await axios.get(`${config.MS_URL}/customerorder?filter=name=${ms_numOrder}`, axiosParamsForMS)
            if (res.data.rows.length) {
                console.log('Order №'+ms_numOrder+' is exist!');

                await models.Shop.findOneAndUpdate({ _id }, { 'serviceStatus.mySklad': true });

            } else {
                // generate positions
                setTimeout(async function() {

                    const positions = [];
                    const products = ms_idProduct[ms_purchase];

                    for (let row of products) {
                        const col = parseInt(row.col) || 1;
                        const price = parseInt(row.price);
                        const variant = row.variant;

                        if (variant && variant.length > 10) {

                            console.log('ID FOR VARIANT:', _id);
                            try {
                                const res = await axios.get(`${config.MS_URL}/variant/${encodeURIComponent(variant)}`, axiosParamsForMS);
                                const href = res?.data?.meta?.href;
                                if (href) {
                                    positions.push({
                                        "quantity": col,
                                        "price": (price * 100) / col,
                                        "assortment": {
                                            "meta": {
                                                "href": href,
                                                "metadataHref": `${config.MS_URL}/variant/metadata`,
                                                "type": "variant",
                                                "mediaType": "application/json"
                                            }
                                        }
                                    });
                                }
                            } catch(e) {
                                console.log('VARIANT NOT FOUND');
                            }
                        } else {
                            const art = row.art;
                            const res = await axios.get(`${config.MS_URL}/product?search=${encodeURIComponent(art)}`, axiosParamsForMS);

                            if(res.data.rows.length) {
                                positions.push({
                                    "quantity": col,
                                    "price": (price*100)/col,
                                    "assortment": {
                                        "meta": {
                                            "href": res.data.rows[0].meta.href,
                                            "metadataHref": `${config.MS_URL}/product/metadata`,
                                            "type": "product",
                                            "mediaType": "application/json"
                                        }
                                    }
                                });
                                
                            }
                        }

                    }

                    let description = `${ms_delivery} ${ms_index} ${ms_city} ${ms_delivery_address} ${ms_street} ${ms_home} ${ms_room}`;
                    if (!ms_index) description = `${ms_delivery} ${ms_delivery_address} ${ms_street} ${ms_home} ${ms_room}`;
    
                    // create order in moysklad
                    const data = {
                        "name": ms_numOrder,
                        "organization": {
                            "meta": {
                                "href": `${config.MS_URL}/organization/5ef13089-5c69-11ea-0a80-03c20005831c`,
                                "type": "organization",
                                "mediaType": "application/json"
                            }
                        },
                        "agent": {
                            "meta": {
                                "href": counterparty,
                                "type": "counterparty",
                                "mediaType": "application/json"
                            }
                        },
                        "store": {
                            "meta": {
                                "href": `${config.MS_URL}/store/6d334937-71e7-11ec-0a80-09e500a6b0fd`,
                                "type": "store",
                                "mediaType": "application/json"
                            }
                        },
                        "state": {
                            "meta": {
                            "href": `${config.MS_URL}/customerorder/metadata/states/dd8bc62a-caef-11e8-9109-f8fc0033f16c`,
                            "type": "state",
                            "mediaType": "application/json"
                            }
                        },
                        "positions": positions,
                        "description": description
                    }

                    const res = await axios.post(`${config.MS_URL}/customerorder`, data, axiosParamsForMS);

                    console.log('New order №'+ms_numOrder+' created!');
                    // create payment in moysklad
                    const payment_data = {
                        "name": ms_numOrder,
                        "organization": {
                            "meta": {
                                "href": `${config.MS_URL}/organization/5ef13089-5c69-11ea-0a80-03c20005831c`,
                                "metadataHref": `${config.MS_URL}/organization/metadata`,
                                "type": "organization",
                                "mediaType": "application/json"
                            }
                        },
                        "agent": {
                            "meta": {
                                "href": counterparty,
                                "metadataHref": `${config.MS_URL}/counterparty/metadata`,
                                "type": "counterparty",
                                "mediaType": "application/json"
                            }
                        },
                        "sum": parseInt(ms_sumOrder) * 100,
                        "vatSum": parseInt(ms_sumOrder) * 100,
                        "operations": [
                            {
                                "meta": {
                                    "href": res.data.meta.href,
                                    "type": "customerorder"
                                },
                                "linkedSum": parseInt(ms_sumOrder) * 100
                            }
                        ]
                    }

                    await axios.post(`${config.MS_URL}/paymentin`, payment_data, axiosParamsForMS);
                    await models.Shop.findOneAndUpdate({ _id }, { 'serviceStatus.mySklad': true });

                }, 3000);
            }
        } catch(e) {
            throw e;
        }
    }

    try {

        let GoogleSheets = mainFunctions.GoogleSheets;

        const dateStart = new Date(2023, 1, 4);

        await sucPayment();

        // Формируем список заказов
        let values = [];
        let ids = [];

        let shop = await models.Shop.find({ 
            $or: [
                { status: 'Оплачено - не записано' }, 
                { status: 'Оплачено - записано', createdAt: { $gte: dateStart }, 'serviceStatus.mySklad': false }
            ] 
        }).lean();
        
        for (let row of shop) {

            values.push([
                row.purchase,
                row.nik,
                row.telephone,
                row.fio,
                row.city,
                row.index,
                row.street,
                row.home,
                row.room,
                row.delivery,
                row.deliveryAddress,
                row.comment,
                row.numOrder,
                row.sumOrder,
                row.sumDelivery,
                row.summ
            ]);

            const { 
                _id,
                telephone: ms_telephone, 
                fio: ms_fio, 
                nik: ms_nik, 
                numOrder: ms_numOrder, 
                idProduct: ms_idProduct,
                purchase: ms_purchase,
                delivery: ms_delivery,
                deliveryAddress: ms_delivery_address,
                city: ms_city,
                index: ms_index,
                street: ms_street,
                home: ms_home,
                room: ms_room,
                sumOrder: ms_sumOrder,
                serviceStatus: {
                    googleSheets: isWriteGoogleSheet
                }
            } = row;

            if (!isWriteGoogleSheet) ids.push(row._id);

            console.log(`Purchase: ${ms_purchase}, ID: ${_id}`);

            // search Counterparty
            const tel = String(ms_telephone).replace(/\D/g, '');
            const res = await axios.get(`${config.MS_URL}/counterparty?search=${tel}`, axiosParamsForMS);
            if (res.data.rows.length) {
                const counterparty = res.data.rows[0].meta.href;

                console.log('Client finded', counterparty);

                await create_ms_order({ _id, ms_sumOrder, ms_street, ms_home, ms_room, ms_purchase, ms_idProduct, ms_numOrder, counterparty, ms_delivery, ms_delivery_address, ms_city, ms_index });
            } else {
                console.log('Client not found. New Client!');

                const data = {
                    "name": ms_fio,
                    "phone": ms_telephone,
                    "attributes": [{
                        "id": "9d6ea88b-02aa-11e9-9ff4-3150002312fb",
                        "name": "Ник в Instagram",
                        "type": "string",
                        "value": ms_nik
                    }]
                }

                const res = await axios.post(`${config.MS_URL}/counterparty`, data, axiosParamsForMS);
                const counterparty = res.data.meta.href;

                console.log('New Client added', counterparty);

                await create_ms_order({ _id, ms_sumOrder, ms_street, ms_home, ms_room, ms_purchase, ms_idProduct, ms_numOrder, counterparty, ms_delivery, ms_delivery_address, ms_city, ms_index });
            }
        }

        await GoogleSheets(async auth => {
            try {
                const sheets = google.sheets({version: 'v4', auth});

                if (shop.length > 0) {

                    const resource = {
                        values,
                    };
                    
                    sheets.spreadsheets.values.append({
                        spreadsheetId: '1HGsuKdWEIcYjqWib2a5ApI-txNtybNl8Z0oR6ZPR59U',
                        range: `ОПЛАТА!A:P`,
                        valueInputOption: 'RAW',
                        resource
                    });

                    await models.Shop.updateMany({_id: { $in: ids }}, { status: 'Оплачено - записано', 'serviceStatus.googleSheets': true });

                } else {
                    console.log('Not data for write');
                }

            } catch(e) {
                console.error(e);
            }
        });

    } catch(e) {
        if (e?.data?.errors) {
            console.error(e.data.errors[0].error)
        } else {
            console.error(e);
        }
    }
}

// Забираем данные из гугла по статусу оплаты ...
//cron.schedule('* * * * *', async () => {
//    await getGoogleData();
//});
// Сохраняем в гугл и мой склад информацию о оплатах
// cron.schedule('* * * * *', async () => {
//     let now = new Date();
//     let minute = now.getMinutes();

//     if (minute % 2 == 0) {
//         await getGoogleData();
//     } else {
//         await setDataForGoogleAndMS();
//     }
// });

app.listen(config.PORT, async () => {
  console.log(`Example app listening on port ${config.PORT}!`);
  await setDataForGoogleAndMS();
});