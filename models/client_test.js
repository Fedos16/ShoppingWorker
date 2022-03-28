const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema(
	{
		Login: { type: String },
		PersonalData: {
			SurName: String,
			FirstName: String,
			MiddleName: String,
			Telephone: String,
			Email: String,
			Instagram: String,
			Birthday: Date
		},
		Security: {
			Verification: {
				Status: { type: Boolean, default: false },
				Date: Date
			},
			ResetPassword: {
				Status: { type: Boolean, default: false },
				Date: Date
			}
		},
		SaveAddress: { type: Array, default: [] },
	},
  	{
    	timestamps: true
  	}
);

schema.set('toJSON', {
  	virtuals: true
});

module.exports = mongoose.model('Client_Test', schema);