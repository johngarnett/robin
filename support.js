const fs = require('fs')

// Various support functions.

const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function lower(code) {
   return LOWER.charAt(code)
}

function upper(code) {
   return UPPER.charAt(code)
}

function writeFile(filename, lines) {
   try {
      fs.writeFileSync(filename, lines.join("\n"))
   } catch (e) {
      console.log('Error: unable to write file ' + filename)
   }
}

function readFile(filename) {
   try {
      var data = fs.readFileSync(filename, 'utf8')
      var lines = data.split("\n")

      // Trim any extraneous blank line.
      if (lines[lines.length - 1] == "") {
         lines.pop()
      }
      return lines
   } catch (e) {
      console.log('Error:', e.stack)
   }
}

// Fisher-Yates random shuffle of an array.

function randomize(a) {
   var n = a.length

   for (var i = n - 1; i > 0; i--) {
      var j = random(i)
      var temp = a[j]

      a[j] = a[i]
      a[i] = temp
   }
   return a
}

// Return a random number between 0 and n inclusive

function random(n) {
   return Math.floor(Math.random() * (n + 1))
}

function exit(code) {
   process.exit(code)
}

exports.randomize = randomize
exports.random = random
exports.readFile = readFile
exports.writeFile = writeFile
exports.exit = exit
exports.lower = lower
exports.upper = upper
