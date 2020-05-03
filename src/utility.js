const { readdir, unlink } = require('fs');
const { join } = require('path');

module.exports = {

  between(min, max) {

    return Math.floor(
      Math.random() * (max - min) + min
    );

  },

  clearOutputDir(dir) {

    readdir(dir, (err, files) => {

      if (err) {
        throw err;
      };

      for (const file of files) {

        unlink(join(dir, file), err => {
          if (err) {
            throw err;
          };
        });

      }

    });

  },

  getDate() {

    const dtFormatter = new Intl.DateTimeFormat('en-IN',);

    return (dtFormatter.format(Date.now()).replace(/\//g, '-'));

  }

};
