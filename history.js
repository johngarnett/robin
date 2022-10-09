// Previous season history

const { readFile } = require('./support')

const FRESH = 'fresh'
const DUPLICATE = 'duplicate'
const REVERSED = 'reversed'

var history = {}

function matchupQuality(home, away) {
   if (history[home][away].season == 0) {
      return FRESH
   }
   return isDuplicate(home, away) ? DUPLICATE : REVERSED
}

function season(home, away) {
   return history[home][away].season
}

function isDuplicate(home, away) {
   return ((history[home][away].season > 0) && (history[home][away].home == home))
}

function loadHistory(filename, teams, lookup) {

   teams.forEach(team1 => {
      history[team1.id] = {}
      teams.forEach(team2 => {
         history[team1.id][team2.id] = {
            season: 0,
            home: team1.id,
            away: team2.id
         }
      })
   })
   var lines = readFile(filename)

   lines.forEach(line => {
      var parts = line.split(/\s+/)
      var home = lookup(parts[2])
      var away = lookup(parts[3])
      var match = {
         season: parseInt(parts[0]),
         home: home,
         away: away
      }

      if ((home != undefined) && (away != undefined)) {
         if (match.season > history[home][away].season) {
            history[home][away] = match
            history[away][home] = match
         }
      }
   })
}

function sortCandidatesByMatchupQuality(home, teams) {
   var oteams = []

   for (var i = 0; i < teams.length; i++) {
      oteams.push(teams[i])
   }
   oteams.sort((a, b) => {
      var c1 = history[home.id][a.id].away === home.id
      var c2 = history[home.id][b.id].away === home.id

      if (c1 && c2) {
         return history[home.id][a.id].season - history[home.id][b.id].season
      }
      if (c1) {
         return -1
      } else if (c2) {
         return 1
      }
      if (history[home.id][a.id].season == 0) {
         return -1
      } else if (history[home.id][b.id].season == 0) {
         return 1
      }
      return 0
   })
   return oteams
}

exports.loadHistory = loadHistory
exports.isDuplicate = isDuplicate
exports.season = season
exports.matchupQuality = matchupQuality
exports.sortCandidatesByMatchupQuality = sortCandidatesByMatchupQuality
