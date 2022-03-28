const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema(
	{
		Login: { type: String },
		Password: { type: String },
        TypeUser: { type: String },
		Status: { type: Boolean, default: true },
	},
  	{
    	timestamps: true
  	}
);

schema.set('toJSON', {
  	virtuals: true
});

module.exports = mongoose.model('User_Test', schema);