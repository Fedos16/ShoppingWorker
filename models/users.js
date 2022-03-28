const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema(
	{
		Login: { type: String },
		Password: { type: String },
		Status: { type: Boolean, default: true },
		SaveAddress: { type: Array, default: [] },
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
		}
	},
  	{
    	timestamps: true
  	}
);

schema.set('toJSON', {
  	virtuals: true
});

module.exports = mongoose.model('User', schema);