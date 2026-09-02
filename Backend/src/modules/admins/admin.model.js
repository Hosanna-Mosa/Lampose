const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    role: {
      type: String,
      /* 'Food Admin' works the food-partner approval queue and nothing else.
         A role rather than a flag because the console already gates its nav
         and its pages on `role`, and a second mechanism beside that one is how
         the two drift apart. See foodAdmin.routes.js for what it unlocks.

         'Support' answers support threads from all three apps and does
         nothing else — see supportAdmin.routes.js. It is a seventh role rather
         than a reuse of 'Food Admin' because support spans the stay side too,
         and because the alternative readings are both wrong in opposite
         directions: giving restaurant approvers the safety queue, or giving
         support staff the power to put a rider on the road.

         Adding a value to this enum is additive — every existing account keeps
         the role it has, and every role that could read a page yesterday still
         can. */
      enum: ['Super Admin', 'Admin', 'Editor', 'Viewer', 'Food Admin', 'Support'],
      default: 'Admin',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Pending'],
      default: 'Active',
    },
    // Empty by default — the console renders initials rather than a stock photo.
    avatar: {
      type: String,
      default: '',
    },
    lastLogin: {
      type: String,
      default: 'Never',
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt password using bcrypt before saving
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare entered password with hashed password in database
adminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
