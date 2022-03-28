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
    venCode: {
        type: String
    },
    nameProduct: {
        type: String
    },
    numberProduct: {
        type: String
    },
    variantProduct: {
        type: String
    },
    amount: {
        type: String
    },
    status: {
        type: String
    },
    sumDelivery: {
        type: String
    }
  },
  {
        timestamps: true
  }
);

schema.set('toJSON', {
  virtuals: true
});

module.exports = mongoose.model('SheetsData', schema);