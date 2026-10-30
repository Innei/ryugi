'use strict';

const { createCommentWatch, main } = require('../skills/artifacts/app/comment-watch.cjs');

module.exports = { createCommentWatch };
if (require.main === module) main();
