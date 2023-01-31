const express = require('express');

const cron = require('node-cron');
var { google } = require('googleapis');

const axios = require('axios')

const mongoose = require('mongoose');
const MongoClient = require('mongodb').MongoClient;

const config = require('./config');
const models = require('./models');
const mainFunctions = require('./helpers/index');

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
    let data = await models.Shop.find({status: 'Регистрация оплаты'});

    for (let row of data){
        let order = row.numOrder;
        let id = row._id;
        let sberStatus = await axios.get(`https://securecardpayment.ru/payment/rest/getOrderStatusExtended.do?userName=${login}&password=${pasw}&orderNumber=${order}`);
        if (sberStatus.data.orderStatus == 2){
            await models.Shop.findOneAndUpdate({_id: id}, {status: 'Оплачено - не записано'});
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

    const start = new Date();

    await GoogleSheets(async auth => {

        const id_table = '1HGsuKdWEIcYjqWib2a5ApI-txNtybNl8Z0oR6ZPR59U';
    
        const sheet = google.sheets({version: 'v4', auth});
        const spreadsheet = await sheet.spreadsheets.get({ spreadsheetId: id_table });
    
        let sheets_arr = spreadsheet.data.sheets;
        const sheets = [];
        for (let row of sheets_arr) {
            let name = row.properties.title;
            if (name != "ОПЛАТА" && name != 'Оплата тест') {
                sheets.push(`${name}!A2:H`);
            }
        }
    
        let sheets_data = await sheet.spreadsheets.values.batchGet({ 
            spreadsheetId: id_table,
            ranges: sheets
        });
    
        let no_pays = [];
    
        let valueRanges = sheets_data.data.valueRanges;
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
        console.log(`Data upload from Google Sheets in ${new Date() - start} ms`);
    
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
    
        console.log(` -- Read rows in: ${new Date() - start_n} ms`);
        console.log(`Arrays: Remove - ${remove_arr.length}, Add - ${new_arr.length}, CHANGE: ${arr_change.length}`);

        for (let row of arr_change) {
            await models.SheetData.findOneAndUpdate({ _id: row._id }, row.data);
        }
    
        await models.SheetData.deleteMany({ _id: { $in: remove_arr } });
        await models.SheetData.insertMany(new_arr);
    
        console.log(` -- Updated completed in: ${new Date() - start} ms`);
    
    });
}
async function setDataForGoogleAndMS() {
    async function create_ms_order(ms_sumOrder, ms_street, ms_home, ms_room, ms_purchase, ms_idProduct, ms_numOrder, counterparty, headers, ms_login, ms_pass, ms_delivery, ms_delivery_address) {
        // search order in moysklad
        axios.get(
            'https://online.moysklad.ru/api/remap/1.1/entity/customerorder?filter=name='+ms_numOrder,
        {
            headers: headers,
            auth: {username: ms_login,password: ms_pass}
        }).then(function(response) {
    
            if (response.data.rows.length > 0) {
                console.log('Order №'+ms_numOrder+' exist!');
            } else {
                // generate positions
                setTimeout(async function() {
                    var positions = [];
                    for (var i = 0; i < ms_idProduct[ms_purchase].length; i++) {
                    
                        var col = parseInt(ms_idProduct[ms_purchase][i].col);
                        var price = parseInt(ms_idProduct[ms_purchase][i].price);
                        if (col == null) var col = 1;
                        var variant = ms_idProduct[ms_purchase][i].variant;
                        console.log(` --- VARIANT: ${variant}`);
                        if(variant != null && variant != '') {
                            var response = await axios.get(
                                'https://online.moysklad.ru/api/remap/1.1/entity/variant/'+encodeURIComponent(variant),
                            {
                                headers: headers,
                                auth: {username: ms_login,password: ms_pass}
                            });
                            if(response.data.meta.href) {
                                positions.push({
                                    "quantity": col,
                                    "price": (price*100)/col,
                                    "assortment": {
                                        "meta": {
                                        "href": response.data.meta.href,
                                        "metadataHref": "https://online.moysklad.ru/api/remap/1.1/entity/variant/metadata",
                                        "type": "variant",
                                        "mediaType": "application/json"
                                        }
                                    }
                                });
                            }
                        }else{
                            var response = await axios.get(
                                'https://online.moysklad.ru/api/remap/1.1/entity/product?search='+encodeURIComponent(ms_idProduct[ms_purchase][i].art),
                            {
                                headers: headers,
                                auth: {username: ms_login,password: ms_pass}
                            });
                            if(response.data.rows.length > 0) {
                                //this.product_href = response.data.rows[0].meta.href;
                                //console.log(response.data.rows[0].meta.href);
                                //console.log(col);
                                //console.log(price);
                                positions.push({
                                    "quantity": col,
                                    "price": (price*100)/col,
                                    "assortment": {
                                        "meta": {
                                            "href": response.data.rows[0].meta.href,
                                            "metadataHref": "https://online.moysklad.ru/api/remap/1.1/entity/product/metadata",
                                            "type": "product",
                                            "mediaType": "application/json"
                                        }
                                    }
                                });
                                
                            }
                        }
                    }
    
                    // create order in moysklad
                    var createOrderUrl = 'https://online.moysklad.ru/api/remap/1.1/entity/customerorder';
                    var data = {
                        "name": ms_numOrder,
                        "organization": {
                            "meta": {
                                "href": "https://online.moysklad.ru/api/remap/1.1/entity/organization/5ef13089-5c69-11ea-0a80-03c20005831c",
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
                                "href": "https://online.moysklad.ru/api/remap/1.1/entity/store/6d334937-71e7-11ec-0a80-09e500a6b0fd",
                                "type": "store",
                                "mediaType": "application/json"
                            }
                        },
                        "state": {
                            "meta": {
                            "href": "https://online.moysklad.ru/api/remap/1.1/entity/customerorder/metadata/states/dd8bc62a-caef-11e8-9109-f8fc0033f16c",
                            "type": "state",
                            "mediaType": "application/json"
                            }
                        },
                        "positions": positions,
                        "description": ms_delivery+' '+ms_delivery_address+' '+ms_street+' '+ms_home+' '+ms_room 
                    }
                    axios.post(createOrderUrl, data, {
                        headers: headers,
                        auth: {username: ms_login,password: ms_pass}
                    }).then(function(response) {
                        console.log('New order №'+ms_numOrder+' created!');
                        var order_ms_id = response.data.id;
                        // create payment in moysklad
                        var createPaymentUrl = 'https://online.moysklad.ru/api/remap/1.1/entity/paymentin';
                        var payment_data = {
                            "name": ms_numOrder,
                            "organization": {
                                "meta": {
                                    "href": "https://online.moysklad.ru/api/remap/1.1/entity/organization/5ef13089-5c69-11ea-0a80-03c20005831c",
                                    "metadataHref": "https://online.moysklad.ru/api/remap/1.1/entity/organization/metadata",
                                    "type": "organization",
                                    "mediaType": "application/json"
                                }
                            },
                            "agent": {
                                "meta": {
                                    "href": counterparty,
                                    "metadataHref": "https://online.moysklad.ru/api/remap/1.1/entity/counterparty/metadata",
                                    "type": "counterparty",
                                    "mediaType": "application/json"
                                }
                            },
                            "sum": parseInt(ms_sumOrder)*100,
                            "vatSum": parseInt(ms_sumOrder)*100,
                            "operations": [
                                {
                                    "meta": {
                                    "href": response.data.meta.href,
                                    "type": "customerOrder"
                                },
                                    "linkedSum": parseInt(ms_sumOrder)*100
                                }
                            ]
                        }

                        axios.post(createPaymentUrl, payment_data, {
                            headers: headers,
                            auth: {username: ms_login,password: ms_pass}
                        }).then(function(response) {
                            //generatePositions(ms_idProduct, ms_purchase, headers, ms_login, ms_pass, order_ms_id);
                        }).catch(function(error) {
                            console.error(error);
                        });
    
                        //var already_query = [];
    
                    
                    }).catch(function(error) {
                        console.error(error);
                    });
                }, 3000);
            }
        }).catch(function(error) {
            console.error(error);
        });
    }
    let GoogleSheets = mainFunctions.GoogleSheets;


    const now = new Date();

    await sucPayment();

    // Формируем список заказов
    let values = [];
    let ids = [];

    let shop = await models.Shop.find({status: 'Оплачено - не записано'});
    for (let row of shop) {
        ids.push(row._id);
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
    }
    for (let x = 0; x < ids.length; x++){
        console.log('ID - ' + ids[x]);

        // moysklad auth
        const headers = {
            'Content-Type': 'application/json',
        }

        const ms_login = 'Admin@9645054848';
        const ms_pass = 'marmar3587133mar';
        let ms_telephone = shop[x].telephone;
        let ms_fio = shop[x].fio;
        let ms_nik = String(shop[x].nik).toLowerCase();
        let ms_numOrder = shop[x].numOrder;
        let ms_idProduct = shop[x].idProduct;
        let ms_purchase = shop[x].purchase;
        let ms_delivery = shop[x].delivery;
        let ms_delivery_address = shop[x].deliveryAddress;
        let ms_street = shop[x].street;
        let ms_home = shop[x].home;
        let ms_room = shop[x].room;
        let ms_sumOrder = shop[x].sumOrder;

        //search counterparty
        await axios.get(
            'https://online.moysklad.ru/api/remap/1.1/entity/counterparty?search='+ms_telephone,
        {
            headers: headers,
            auth: {username: ms_login,password: ms_pass}
        }).then(async function(response) {
            if (response.data.rows.length > 0) {
                var counterparty = response.data.rows[0].meta.href;
                console.log('New Client '+counterparty);
                await create_ms_order(ms_sumOrder, ms_street, ms_home, ms_room, ms_purchase, ms_idProduct, ms_numOrder, counterparty, headers, ms_login, ms_pass, ms_delivery, ms_delivery_address);
            } else{
                console.log('Client not found. A new one will be created!');
                // if counterparty not exists
                var createCounterPartyUrl = 'https://online.moysklad.ru/api/remap/1.1/entity/counterparty';
                var data = {
                "name": ms_fio,
                "phone": ms_telephone,
                "attributes": [
                    {
                    "id": "9d6ea88b-02aa-11e9-9ff4-3150002312fb",
                    "name": "Ник в Instagram",
                    "type": "string",
                    "value": ms_nik
                    }
                ]
                }
                await axios.post(createCounterPartyUrl, data, {
                    headers: headers,
                    auth: {username: ms_login,password: ms_pass}
                }).then(async function(response) {
                    var counterparty = response.data.meta.href;
                    console.log('New Client added '+counterparty);
                    await create_ms_order(ms_sumOrder, ms_street, ms_home, ms_room, ms_purchase, ms_idProduct, ms_numOrder, counterparty, headers, ms_login, ms_pass, ms_delivery, ms_delivery_address);
                }).catch(function(error) {
                    console.error(error);
                });
            }
        
        }).catch(function(error) {
            console.error(error);
        });
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

                await models.Shop.updateMany({_id: { $in: ids }}, {status: 'Оплачено - записано'});

            } else {
                console.log('No data for write!');
            }

        } catch(e) {
            console.error(e);
        }
    });
}

// Забираем данные из гугла по статусу оплаты ...
//cron.schedule('* * * * *', async () => {
//    await getGoogleData();
//});
// Сохраняем в гугл и мой склад информацию о оплатах
cron.schedule('* * * * *', async () => {
    let now = new Date();
    let minute = now.getMinutes();

    if (minute % 2 == 0) {
        await getGoogleData();
    } else {
        await setDataForGoogleAndMS();
    }
});

app.listen(config.PORT, () =>
  console.log(`Example app listening on port ${config.PORT}!`)
);