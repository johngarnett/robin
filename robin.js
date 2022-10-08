/*
Copyright (c) 2022 John Garnett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/*
   Attempts to find a perfect round robin schedule for N teams using N / 2 venues, with two teams per venue. Each team
   plays each other team exactly once. Each venue hosts one match per week.

   Each venue, A, hosts two home teams, a1 and a2. Each week of the season, one of these two teams will be the home
   team in venue A. Half of the weeks will have a1 as the home team, with a2 being the away team in another venue. The
   other half will have a2 as the home team and a1 as the away team in another venue.

   This is a brute force algorithm that skips branches which would stem from candidate matches causing constraint violations,
   such as playing the same team twice, appearing as the away team more than once in a given venue, playing twice in the
   same week, appearing as the home team too many times, and so on.

   Author: John Garnett
   Date: 2022 September 29
*/

const fs = require('fs')
const { program } = require('commander')

const DEFAULT_VENUES = 5

program
   .option('-v, --verbose', 'Display informational messages during execution of the scheduler.', false)
   .option('--venues <number>', 'Indicate how many venues are available.', DEFAULT_VENUES)
   .option('--weeks <number>', 'Indicate the duration of the season in weeks.')
   .option('--output <filename>', 'Indicate the filename for the generated schedule.')
   .option('--sister <first | last | both | none>', 'Indicate that the season include matches between sibling teams in the first week, last week, both, or none.', 'last')
   .option('--random', 'Consider the home and away candidates in a random order.', false)
   .option('--brute', 'Do not make any simplifying assumptions about the assignment of home teams (much slower).', false)
   .option('--names <filename>', 'Specify venue names and team names to use instead of venues A, B, ... and teams a1, a2, b1, b2, ...')
   .option('--relax', 'Allow duplicates in the list of opponents appearing as the visiting team at a given venue over the course of the season.', false)
   .option('--pattern <filename>', 'Add some constraints to make the search go faster.')
   .option('--debug', 'Include any debug output', false)
   .option('--mnp', 'Use Monday Night Pinball (MNP) CSV format for outputting the schedule.', false)
   .option('--groups <filename>', 'Indicate group membership for use with the --intra and --inter flags.')
   .option('--intra', 'Only schedule matches between teams belonging to the same group (see --groups).', false)
   .option('--inter', 'Only schedule matches between teams belonging to different groups (see --groups).', false)
   .option('--history <filename>', 'Provide a history of previous matches so that the generated schedule may avoid duplicating recent matchups.')

program.parse()

const options = program.opts()

var nWeeks = 2 * (options.venues - 1)

if ((options.weeks > 0) && (options.weeks < nWeeks)) {
   nWeeks = options.weeks
}

const ALLOW_REPEAT_VISITORS = options.relax

const TEAM_NAME_PATTERN = /^[a-z][12]$/
const NUMBER_OF_VENUES = options.venues
const NUMBER_OF_TEAMS = 2 * NUMBER_OF_VENUES
const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const HOME = true

var NUMBER_OF_WEEKS
var MAX_HOME

setWeeks(nWeeks)

var SOLO = {
   count: 0,
   max: 0,
}

var bestScore = 9999
var START_WEEK = 0
var played = new Array(NUMBER_OF_TEAMS)
var found = false
var deadend = 0
var names = readNames()
var teams = makeTeams()
var venues = makeVenues()
var schedule = makeWeeks()
var history = {}
var duplicated = 0

SOLO.max = Math.floor(SOLO.count / 2)

verbose(['SOLO', SOLO])

initialize()

debug(schedule)

// Search starting with week 0, venue 0, and the home team.

search(HOME, START_WEEK, 0, schedule)

verbose(['Deadends encountered', Number(deadend).toLocaleString()])

function setWeeks(n) {
   NUMBER_OF_WEEKS = n
   MAX_HOME = Math.ceil(n / 2)
}

function initialize() {
   if (options.groups) {
      loadGroups(options.groups)
   }
   if (options.history) {
      loadHistory(options.history)
   }
   if (options.pattern) {
      return loadPattern(options.pattern)
   }
   if (options.brute) {
      return
   }
   var filename = 'init' + NUMBER_OF_VENUES + '.csv'

   if (fs.existsSync(filename)) {
      return loadPattern(filename)
   }
   verbose('Could not find file: ' + filename)
}

function search(isHome, iweek, ivenue) {
   if (found) {
      return
   }
   if (iweek == NUMBER_OF_WEEKS) {
      return foundIt(schedule)
   }
   if (isHome) {
      return considerHomeCandidates(iweek, ivenue)
   } else {
      return considerAwayCandidates(iweek, ivenue)
   }
}

// showPlaying: debugging tool

function showPlaying(n) {
   console.log('-------------')
   for (var h = 0; h < n; h++) {
      var week = schedule[h]

      console.log('___________')
      for (var i = 0; i < week.assignments.length; i++) {
         console.log(JSON.stringify(['(week, ivenue, venue, solo venue, home, away, homeid, awayid, homePlaying, awayPlaying, same group) = ',
            h,
            i,
            venues[i].name,
            venues[i].solo,
            teamName(week.assignments[i].home),
            teamName(week.assignments[i].away),
            week.assignments[i].home,
            week.assignments[i].away,
            week.playing[week.assignments[i].home],
            week.playing[week.assignments[i].away],
            (week.assignments[i].empty) ? 'empty' : teams[week.assignments[i].home].group == teams[week.assignments[i].away].group
         ]))
      }
   }
}

function considerHomeCandidates(iweek, ivenue) {
   var w = schedule[iweek]
   var v = venues[ivenue]
   var assignment = w.assignments[ivenue]

   if (w.assignments[ivenue].homeLocked) {
      var team = teams[w.assignments[ivenue].home]

      if (team.empty) {
         return continueFromEmpty(iweek, ivenue, assignment, team, v, w)
      }
      if (w.assignments[ivenue].awayLocked) {
         return homeSearch(iweek, ivenue)
      } else {
         var recentHomeTeam = v.recentHomeTeam;

         v.recentHomeTeam = assignment.home
         considerAwayCandidates(iweek, ivenue)
         v.recentHomeTeam = recentHomeTeam
         return
      }
   }
   var ts = filterHome(assignment, v, w, iweek, ivenue)

   ts.forEach(team => {
      if (team.empty) {
         w.solo.empty++
         continueFromEmpty(iweek, ivenue, assignment, team, v, w)
         w.solo.empty--
         return
      }
      var recentHomeTeam = v.recentHomeTeam;

      v.recentHomeTeam = team.id
      assignment.home = team.id
      w.playing[team.id] = true
      team.home++
      if (team.solo) {
         w.solo.full++
      }

      considerAwayCandidates(iweek, ivenue)

      if (!found) {
         deadend++
      }
      if (team.solo) {
         w.solo.full--
      }
      team.home--
      w.playing[team.id] = false

      // Restore recentHomeTeam to what it was prior to calling search(...)
      v.recentHomeTeam = recentHomeTeam
   })
}

function filterHome(assignment, v, w, iweek, ivenue) {
   var ex = {}

   var ts = v.teams.filter(team => {
      if (v.solo && (SOLO.max > 0)) {
         if (!team.empty && (w.solo.full == SOLO.max)) {
            reason(ex, 'full', team)
            return false
         }
         if (team.empty && (w.solo.empty == SOLO.max)) {
            reason(ex, 'soloEmptyMax', team)
            return false
         }
      }
      if (team.home >= team.maxHome) {
         reason(ex, 'maxHome', team)
         return false
      }
      if (team.empty && (assignment.awayLocked || assignment.awayRegex)) {
         // Cannot leave this venue empty if the away team was specified in a pattern file.
         reason(ex, 'awayOccupied', team)
         return false
      }
      if (w.playing[team.id]) {
         // Already playing this week
         reason(ex, 'playing', team)
         return false
      }
      if (assignment.homeRegex && !assignment.homeRegex.test(team.canon)) {
         if (options.debug) {
            log('considerHomeCandidates: ' + team.canon + ' did not match regex: ' + assignment.homeRegex.toString())
         }
         ex.regex = teamName(team.id)
         reason(ex, 'regex', team)
         return false
      }
      return true
   })
   if (ts.length == 0) {
      if (options.debug) {
         log(['DEADEND HOME (iweek, ivenue, venue, ex)', iweek, ivenue, venueName(ivenue), ex])
      }
   }
   return reorderTeams(v, ts)
}

function considerAwayCandidates(iweek, ivenue) {
   var w = schedule[iweek]
   var v = venues[ivenue]
   var assignment = w.assignments[ivenue]
   var home = teams[w.assignments[v.id].home]

   if (assignment.awayLocked) {
      var team = teams[assignment.away]

      setPlayed(assignment.home, assignment.away, true)
      homeSearch(iweek, ivenue)
      setPlayed(assignment.home, assignment.away, false)
      return
   }
   var oteams = filterAway(teams, iweek, ivenue, w, v)

   if (options.random) {
      oteams = randomize(oteams)
   }
   if (options.relax) {
      // Consider non-duplicates first
      oteams = fresh(oteams, v.opponents)
   }
   if (options.history) {
      oteams = sortByMatchupRecency(home, oteams)
   }
   for (var z = oteams.length - 1; z >= 0; z--) {
      var team = oteams[z]
      var po = v.opponents[team.id]
      var dupe = duplicated

      // Record this assignment.

      if (team.solo) {
         w.solo.away++
      }
      team.away++
      v.opponents[team.id] = true
      w.assignments[team.ivenue].sisterAway = true
      w.playing[team.id] = true
      setPlayed(home.id, team.id, true)

      w.assignments[v.id].away = team.id

      if (isSame(home.id, team.id)) {
         duplicated++
      }

      homeSearch(iweek, ivenue)

      if (!found) {
         deadend++
      }
      // Erase this abandoned assignment from the records.

      if (team.solo) {
         w.solo.away--
      }
      team.away--
      duplicated = dupe
      w.assignments[team.ivenue].sisterAway = false
      v.opponents[team.id] = po
      w.playing[team.id] = false
      setPlayed(home.id, team.id, false)
   }
}

function isSame(home, away) {
   if (!options.history) {
      return false
   }
   return ((history[home][away].season > 0) && (history[home][away].home == home))
}

function sortByMatchupRecency(home, oteams) {
   oteams.sort((b, a) => {
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

function setPlayed(home, team, value) {
   played[home][team] = value
   played[team][home] = value
}

function continueFromEmpty(week, ivenue, assignment, team, v, w) {
   var recentHomeTeam = v.recentHomeTeam;

   assignment.empty = true
   v.recentHomeTeam = team.id

   homeSearch(week, ivenue)

   assignment.empty = false
   v.recentHomeTeam = recentHomeTeam
}

function homeSearch(week, ivenue) {
   if ((ivenue + 1) == NUMBER_OF_VENUES) {
      search(HOME, week + 1, 0)
   } else {
      search(HOME, week, ivenue + 1)
   }
}

function fresh(teams, opponents) {
   var oteams = []

   teams.forEach(team => {
      if (opponents[team.id]) {
         oteams.unshift(team)
      } else {
         oteams.shift(team)
      }
   })
   return oteams
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

function foundIt() {
   verbose(['Found a schedule! '])
   found = true
   sister()
   debug(schedule)
   output(options.output)
   return true
}

// TODO: fix sister for solo teams

function sister() {
   if (options.sister == "none") {
      return
   }
   var week = makeWeek()

   for (var v = 0; v < NUMBER_OF_VENUES; v++) {
      var which = (venues[v].teams[0].home < venues[v].teams[1].home) ? 0 : 1

      week.assignments[v].home = venues[v].teams[which].id
      week.assignments[v].away = venues[v].teams[1 - which].id
   }
   if (options.sister == "last") {
      schedule.push(week)
   } else if ((options.sister == "first") || (options.sister == "both")) {
      schedule.unshift(week)
   }
   if (options.sister == "both") {
      var first = makeWeek()

      for (var v = 0; v < NUMBER_OF_VENUES; v++) {
         first.assignments[v].home = week.assignments[v].away
         first.assignments[v].away = week.assignments[v].home
      }
      schedule.push(first)
   }
}

// filterAway: remove teams which have already played this week, or already played this opponent, or already played in the venue, ...

function filterAway(oteams, iweek, ivenue, w, v) {
   var home = w.assignments[ivenue].home
   var ex = {}

   var ot = oteams.filter(team => {
      var assignment = w.assignments[v.id]
      var same = isSame(home, team.id) ? 1 : 0

      if ((duplicated + same) >= bestScore) {
         return false
      }
      if (team.empty) {
         reason(ex, 'empty', team)
         return false
      }
      if (assignment.awayRegex && !assignment.awayRegex.test(team.canon)) {
         if (options.debug) {
            log('filterAway: ' + team.canon + ' did not match regex: ' + assignment.awayRegex.toString())
         }
         reason(ex, 'regex', team)
         return false
      }
      if (options.inter && (teams[home].group == team.group)) {
         reason(ex, 'inter', team)
         return false
      }
      if (options.intra && (teams[home].group != team.group)) {
         reason(ex, 'intra', team)
         return false
      }
      if (team.ivenue == ivenue) {
         // skipping venue's own teams
         reason(ex, 'self', team)
         return false
      }
      if (w.playing[team.id]) {
         // Already playing this week.
         reason(ex, 'playing', team)
         return false
      }
      if (team.solo && (w.solo.away == SOLO.max)) {
         reason(ex, 'soloAwayMax', team)
         return false
      }
      if (w.assignments[team.ivenue].sisterAway) {
         reason(ex, 'sisterAway', team)
         return false
      }
      if (team.away == (NUMBER_OF_WEEKS - team.maxHome)) {
         reason(ex, 'away', team)
         return false
      }
      if (v.opponents[team.id] && !ALLOW_REPEAT_VISITORS) {
         // If this venue has already hosted this opponent, then skip it.
         reason(ex, 'repeat', team)
         return false
      }
      var homeId = assignment.home

      if (played[team.id][homeId]) {
         // Already played this candidate opponent as the away team
         reason(ex, 'played', team)
         return false
      }
      return true
   })
   if (ot.length == 0) {
      if (options.debug) {
         console.log(['DEADEND AWAY (iweek, ivenue, venue, home, ex)', iweek, ivenue, venueName(ivenue), teamName(home), ex])
      }
   }
   return ot
}

function reason(ex, field, team) {
   if (!ex[field]) {
      ex[field] = []
   }
   ex[field].push(teamName(team.id))
}

// reorderTeams: try to alternate prime and sister home teams if possible.
// This attempts to avoid giving a team too many consecutive away games.

function reorderTeams(v, teams) {
   if (teams.length != 2) {
      return teams
   }
   if (options.random) {
      var r = random(1)

      teams = [teams[r], teams[1 - r]]
   }
   if (v.recentHomeTeam == teams[0].id) {
      return [teams[1], teams[0]]
   }
   return teams
}

function lower(code) {
   return LOWER.charAt(code)
}

function upper(code) {
   return UPPER.charAt(code)
}

function makeTeams() {
   var teams = []
   var limit = NUMBER_OF_TEAMS / 2
   var maxHomeSister = MAX_HOME
   var maxHomePrime = (options.intra) ? MAX_HOME : (NUMBER_OF_WEEKS - maxHomeSister)

   for (var i = 0; i < limit; i++) {
      const primeId = 2 * i
      const sisterId = 2 * i + 1
      var t1 = makeTeam(i, primeId, maxHomePrime)
      var t2 = makeTeam(i, sisterId, maxHomeSister)
      
      teams.push(t1)
      teams.push(t2)

      if (options.names && names.teams[t2.id] == null) {
         t1.solo = true
         t2.empty = true
      }
      played[primeId] = new Array(NUMBER_OF_TEAMS)
      played[sisterId] = new Array(NUMBER_OF_TEAMS)
   }
   return teams
}

function makeTeam(i, id, maxHome) {
   const home = venueName(i)

   return {
      venue: home,
      canon: canonName(id),
      id: id,
      ivenue: i,
      maxHome: maxHome,
      home: 0,
      away: 0,
      solo: false,
      empty: false
   }
}

function teamName(id, canon) {
   if (id === null) {
      return null
   }
   if (!canon && names && names.teams[id]) {
      return names.teams[id]
   }
   return canonName(id)
}

function canonName(id) {
   const code = Math.floor(id / 2)
   const suffix = (id % 2) + 1
   const base = lower(code)

   return base + suffix
}

function makeVenues() {
   var venues = []

   for (var i = 0; i < NUMBER_OF_VENUES; i++) {
      var venue = {
         id: i,
         solo: false,
         name: venueName(i),
         teams: [teams[2 * i], teams[2 * i + 1]],
         opponents: new Array(NUMBER_OF_TEAMS),
         away: false,
         recentHomeTeam: undefined
      }

      if (venue.teams[0].empty || venue.teams[1].empty) {
         venue.solo = true
         SOLO.count++
      }
      venues.push(venue)
      teams.forEach(team => {
         venue.opponents[team.id] = false
      })
   }
   return venues
}

function venueName(i) {
   if (names) {
      return names.venues[i]
   }
   return upper(i)
}

function makeWeeks() {
   var weeks = []

   for (var week = 0; week < NUMBER_OF_WEEKS; week++) {
      weeks.push(makeWeek())
   }
   return weeks
}

function makeWeek() {
   var assignments = new Array(NUMBER_OF_VENUES)
   var week = {
      assignments: assignments,
      playing: new Array(NUMBER_OF_TEAMS),
      solo: {
         empty: 0,
         full: 0,
         away: 0
      }
   }

   venues.forEach(venue => {
      assignments[venue.id] =  makeMatch(null, null)
   })
   teams.forEach(team => {
      week.playing[team.id] = false
   })
   return week
}

function makeMatch(home, away) {
   return {
      home: home,
      away: away,
      homeLocked: false,
      awayLocked: false,
      homeRegex: null,
      awayRegex: null,
      empty: false
   }
}

function analyzeSchedule() {
   var same = 0
   var reversed = 0
   var fresh = 0

   if (!options.history) {
      console.log("analyzeSchedule: requires --history option.")
      process.exit(42)
   }

   for (var week = 0; week < schedule.length; week++) {
      for (var venue = 0; venue < NUMBER_OF_VENUES; venue++) {
         var a = schedule[week].assignments[venue]

         if (a.home == null || a.away == null) {
            continue
         }
         // log(history[a.home][a.away])
         if (history[a.home][a.away].season == 0) {
            fresh++
            continue
         }
         if (a.home == history[a.home][a.away].home) {
            same++
            continue
         } else if (a.home == history[a.home][a.away].away) {
            reversed++
            continue
         }
      }
   }
   if (same < bestScore) {
      bestScore = same
      console.log(['(same, fresh, reversed)', same, fresh, reversed])

      var filename = 'solution-' + bestScore + '.csv'

      output(filename)
   }
}

function output(filename) {
   var aheader = ['week', 'venue', 'home', 'away']
   var lines = []

   if (options.mnp) {
      aheader.push('playoffs')
   }
   var header = aheader.join("\t")

   if (filename) {
      lines.push(header)
   }
   if (options.verbose || options.debug) {
      console.log(header)
   }
   for (var week = 0; week < schedule.length; week++) {
      for (var venue = 0; venue < NUMBER_OF_VENUES; venue++) {
         if (schedule[week].assignments[venue].empty) {
            // debug(['empty venue (week, venue)', week, venue])
            continue
         }
         var homeTeam = teamName(schedule[week].assignments[venue].home)
         var awayTeam = teamName(schedule[week].assignments[venue].away)

         elements = [
            week + 1,
            venueName(venue),
            homeTeam,
            awayTeam
         ]
         if (options.mnp) {
            elements.push("FALSE")
         }
         if (options.mnp) {
            elements.push(teams[schedule[week].assignments[venue].away].group)
            elements.push(teams[schedule[week].assignments[venue].away].group == teams[schedule[week].assignments[venue].home].group)
         }
         if (options.mnp) {
            elements.push(getSeason(schedule[week].assignments[venue]))
            elements.push(getReversed(schedule[week].assignments[venue]))
         }
         var data = elements.join("\t")

         if (!filename || options.verbose) {
            console.log(data)
         }
         if (filename) {
            lines.push(data)
         }
      }
   }
   if (filename) {
      try {
         fs.writeFileSync(filename, lines.join("\n"))
      } catch (e) {
      }
   }
}

function getReversed(a) {
   if (history[a.home][a.away].season == 0) {
      return 'fresh'
   }
   return (a.home == history[a.home][a.away].home) ? 'same' : 'reversed'
}

function getSeason(a) {
   return history[a.home][a.away].season
}

function readNames() {
   if (!options.names) {
      return null
   }
   var result = {
      venues: [],
      teams: [],
      teamLookup: {}
   }
   var lines = readFile(options.names)
   var nTeams = 0

   if (lines.length != NUMBER_OF_VENUES) {
      console.log('Error: the ' + options.names + ' file must contain one line per venue.')
      exit(5)
   }
   for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      var match = line.split(/\s+/)

      result.venues.push(match[0])
      result.teams.push(match[1])
      result.teamLookup[match[1]] = result.teams.length - 1
      nTeams++

      if (match.length == 3) {
         result.teams.push(match[2])
         result.teamLookup[match[2]] = result.teams.length - 1
         nTeams++
      } else {
         // The venue hosts only one team.
         result.teams.push(null)
      }
   }
   if (!options.weeks) {
      setWeeks(nTeams - 2)
   }
   return result
}

function analyze() {
   // TODO: compile various stats and correctness checks of interest
   // For example:
   // * for each team, largest sequence of consecutive away games
   // * number of home games, number of away games
   // * number of unique opponents appearing in each venue
   // * number of unique opponents faced by each team
   // * number of unique venues played in by each team
   // * season in which this team was most recently played previously

   var teamStats = new Array(NUMBER_OF_TEAMS)
   var venueStats = new Array(NUMBER_OF_VENUES)

   venues.forEach(venue => {
      venueStats[venue.id] = {
         opponents: {}
      }
   })
   teams.forEach(team => {
      teamStats[team.id] = {}
   })
   schedule.forEach(week => {
      venues.forEach(venue => {
         venueStats[venue.id].opponents[week.assignments[venue.id].away] = true
      })
   })
   debug(venueStats)
   debug(teamStats)
}

function loadHistory(filename) {
   teams.forEach(team1 => {
      history[team1.id] = {}
      teams.forEach(team2 => {
         var match = {
            season: 0,
            home: team1.id,
            away: team2.id
         }

         history[team1.id][team2.id] = match
      })
   })
   var lines = readFile(filename)

   lines.forEach(line => {
      var parts = line.split(/\s+/)
      var home = lookupTeam(parts[2])
      var away = lookupTeam(parts[3])
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

function loadPattern(filename) {
   var lines = readFile(filename)

   if (lines.length > NUMBER_OF_WEEKS) {
      log('Warning: ' + filename + ' contains more rows than the number of weeks in the schedule: ' + NUMBER_OF_WEEKS)
   }
   var limit = (lines.length > NUMBER_OF_WEEKS) ? NUMBER_OF_WEEKS : lines.length

   for (var i = 0; i < limit; i++) {
      var line = lines[i]
      var words = line.split(/\s+/)

      if (words.length > NUMBER_OF_VENUES) {
         console.log("Error: More patterns than venues in: " + line)
         exit(2)
      }

      for (var j = 0; j < words.length; j++) {
         if (words[j].includes(",")) {
            var parts = words[j].split(",")

            setHome(i, j, parts[0])
            setAway(i, j, parts[1])
         } else {
            setHome(i, j, words[j])
         }
      }
   }
   debug('loadPattern')
   debug(schedule)
}

function setHome(week, venue, word) {
   if (!word || (word == '')) {
      return
   }
   if (week >= NUMBER_OF_WEEKS) {
      console.log("Warning: pattern file contains data for too many weeks.")
      return
   }
   var week = schedule[week]
   var assignment = week.assignments[venue]

   if (TEAM_NAME_PATTERN.test(word)) {
      // Exactly matches the name of a team (a1, a2, b1, ...)
      var team = teams[calculateTeamIndex(word)]

      assignment.home = team.id
      assignment.homeLocked = true
      week.playing[team.id] = true
      if (team.solo) {
         week.solo.full++
      } else if (team.empty) {
         week.solo.empty++
      }
      team.home++
   } else {
      debug('setHome: creating regular expression from ' + word)
      assignment.homeRegex = new RegExp(word)
   }
}

function setAway(week, venue, word) {
   if (!word || (word == '')) {
      return
   }
   var week = schedule[week]
   var assignment = week.assignments[venue]
   if (TEAM_NAME_PATTERN.test(word)) {
      // Exactly matches the name of a team (a1, a2, b1, ...)
      var team = teams[calculateTeamIndex(word)]

      if (assignment.homeLocked) {
         setPlayed(assignment.home, team.id, true)
      }
      if (team.solo) {
         week.solo.away++
      }
      week.assignments[team.ivenue].sisterAway == true
      assignment.away = team.id
      assignment.awayLocked = true
      week.playing[team.id] = true
      team.away++
   } else {
      debug('setAway: creating regular expression from ' + word)
      assignment.awayRegex = new RegExp(word)
   }
}

function calculateTeamIndex(team) {
   var base = team.charCodeAt(0) - 'a'.charCodeAt(0)
   var suffix = team.charCodeAt(1) - '0'.charCodeAt(0)

   return 2 * base + suffix - 1
}

function loadGroups(filename) {
   if (!options.names) {
      console.log('Error: the --groups flag must be used together with the --names flag.')
      exit(3)
   }
   var lines = readFile(filename)
   var groups = {}
   var gid = 1

    lines.forEach(line => {
       var parts = line.split(/\s+/)
       var id = lookupTeam(parts[0])

       if (id === undefined) {
          console.log('Error: loadGroups() could not find team ' + parts[0] + ' in ' + options.names)
          exit(6)
       }
       if (groups[parts[1]] === undefined) {
          groups[parts[1]] = gid++
       }
       teams[id].group = groups[parts[1]]
    })
}

function lookupTeam(team) {
   return names.teamLookup[team]
}

function boolean(value) {
   return (value == 1) ? true : false
}

function dump(o) {
   return JSON.stringify(o, null, 3)
}

function log(o) {
   console.log(dump(o))
}

function debug(message) {
   if (options.debug) {
      log(message)
   }
}

function verbose(message) {
   if (options.verbose || options.debug) {
      log(message)
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
      exit(4)
   }
}

function exit(code) {
   process.exit(code)
}
