const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const { Repository } = require('./src/modules/review/repository.model.ts');
  const { User } = require('./src/modules/auth/auth.model.ts');
  const repos = await Repository.find({});
  const users = await User.find({});
  console.log('REPOS:', repos);
  console.log('USERS:', users.map(u => ({ id: u.githubId, name: u.username })));
  process.exit(0);
}
run();
