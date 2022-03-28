const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema(
  {
    purchase: {
        type: String
    },
    nik: {
        type: String
    },
    telephone: {
        type: String
    },
    fio: {
        type: String
    },
    city: {
        type: String
    },
    index: {
        type: String
    },
    street: {
        type: String
    },
    home: {
        type: String
    },
    room: {
        type: String
    },
    delivery: {
        type: String
    },
    deliveryAddress: {
        type: String
    },
    comment: {
        type: String
    },
    numOrder: {
        type: String
    },
    sumOrder: {
        type: String
    },
    sumDelivery: {
        type: String
    },
    summ: {
        type: String
    },
    status: {
        type: String
    },
    idProduct: {
        type: Object
    }
  },
  {
        timestamps: true
  }
);

schema.set('toJSON', {
  virtuals: true
});

module.exports = mongoose.model('Shop', schema);