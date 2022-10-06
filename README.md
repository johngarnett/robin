# robin

## OVERVIEW

You may find the repository for this software on github.com:

   https://github.com/johngarnett/robin

This program attempts to find an ideal round robin schedule for N teams
using N / 2 venues. Each venue serves as the home to two teams.

Here are the constraints imposed by this program by default.

* Each team plays once per week.
* Each team plays every other team exactly once.
* Each team plays half of its games in its home venue and half away as the
  visiting team in the other venues.
* Each team plays as the visitor exactly once in each venue apart from its home.

This application uses a brute force algorithm that skips branches of the
search space which would stem from candidate matches causing constraint
violations, such as playing the same team twice, appearing as the away
team more than once in a given venue, playing twice in the same week,
appearing as the home team too many times, and so on.

As you might imagine, a brute force application may be quite slow if the
search space is too large due to an explosion of possible combinations.
Many of the features of this application were designed to provide ways of
constraining the search space so that a solution may be found in reasonable
time.

Before continuing, read the INSTALL file for information on installing the
round robin scheduling application, robin.js, and its dependencies.

## HELP

To see the help screen, type:

    node robin.js --help

## EXAMPLE

To see the application in action, type this.

    node robin.js --venues=5 --verbose --output=schedule.csv

In about one second, this will generate a 9-week schedule for ten teams
playing in five venues. The number of weeks and the number of teams are
derived from the number of venues. The number of teams is twice the number
of venues. By default, the number of weeks is the number of teams minus 1.

## OUTPUT FILE

The schedule will be output to the screen and to a file named schedule.csv.
You can specify a different output file name via the --schedule flag.
If you omit the --schedule flag, the schedule will be displayed on
screen, but not written to a file.

## MNP FLAG

If you are using this program to generate a schedule for Seattle's 
Monday Night Pinball (MNP) software, you'll want to add the --mnp flag.

    node robin.js --venues=5 --verbose --output=schedule.csv --mnp

The only difference is the "FALSE" field added to the end of each line
of the generated schedule. This indicates that none of the matches are
playoff matches.

## DEFAULT INITIALIZATION

The application reads an initialization file named init5.csv, init6.csv, etc
with the name depending on the value provided via the --venues flag. When
--venues=5 is used, the init5.csv file is used by default. To prevent this
initialization file from being used, you may use the --brute flag.

The init5.csv file looks like this.

~~~
a2	b1	c2	d1	e2
a1	b2	c1	d2	e1
a2
a1
a2
a1
a2
a1
~~~

This constrains the home teams for all venues in the first two weeks. For the
remaining weeks, only the first venue is constrained. When this initialization
file is used, the constrained home teams will be set in this way for every
generated schedule. The away teams are not constrained in this example.

By using this init5.csv file, the program executes in a fraction of a second
instead of a minute or more. To see the difference, compare the running time of
these two variations.

    node robin.js --venues=5 --verbose --output=schedule.csv

and:

    node robin.js --venues=5 --verbose --output=schedule.csv --brute

## RELAX UNIQUENESS CONSTRAINT

Another way to speed up the scheduler, is to use the --relax flag. This removes
the following default constraint.

* Each team plays as the visitor exactly once in each venue apart from its home.

With this constraint removed, the generated schedule is available nearly
instantaneously.

    node robin.js --venues=5 --verbose --output=schedule.csv --brute --relax

The downside is that the schedule is not as nice for the teams, since some teams
may play as the visitor twice in some venues, and not at all in some other venues.

To generate a second for 6 venues and 12 teams, try this.

    node robin.js --venues=6 --verbose --output=schedule.csv

This will complete in about 7 to 30 seconds depending on the speed of your computer.

I wouldn't try adding the --brute flag to a 6-venues run, since that may or may
not finish in your lifetime.

Again, you can speed up the scheduler significantly by adding the --relax flag,
but the resulting schedule will not be as good.

    node robin.js --venues=6 --verbose --output=schedule.csv --relax

## PARTIAL ROUND ROBIN

Another way to speed up the program is to use the --weeks flag to shorten the
season. This will generate a partial round robin schedule.

    node robin.js --venues=6 --verbose --output=schedule.csv --weeks=8

Even with 7 venues and 14 teams, the scheduler is quite fast if you limit the
season duration appropriately.

    node robin.js --venues=7 --verbose --output=schedule.csv --weeks=9

## CUSTOM CONSTRAINTS

If you would like to add your own constraints, you may do that using the --pattern flag.

    node robin.js --venues=6 --verbose --output=schedule.csv --pattern=pattern6.csv

When --pattern is used, The specified pattern file (pattern6.csv in this case) will be
used instead of the init?.csv default pattern files.

~~~
a1,f2	b1,e2	c1,d2	d1,b2	e1,a2	f1,c2
a2,f1	b2,e1	c2,d1	d2,b1	e2,a1	f2,c1
a1,d1	b2	c1,b1	d2,f1	e1	f2,e2
a2,b1	b2,[cde].	c2,f2	d2	,d1	f1,e1
.1,.1
a2
a1
a2
a1
a2
~~~

Note that the pattern file should not include any weeks in which sister teams
play each other ("sister teams" meaning two teams that share the same home venue).

This pattern file shows some additional capabilities for constraining the search space.
In this example, you see that the away team may be constrained as well as the home team.
For example, in the first week, the matchup will be a1 vs f2 in venue A.

## REGULAR EXPRESSIONS

You may use regular expressions to constrain the search space as well. An expression like
this:

    [cde].

means the matching team must be any one of the teams beginning with the letter c, d, or e,
but the numerical part can be number. This would match teams c1, c2, d1, d2, e1, and e2.

An expression like this:

    .1 

matches any letter, but it must end in the number 1. This would match a1, b1, c1, ...
When you use a period in an expression, that will may any letter or number depending
whether the period is the first or second character.

If you want to constrain the away team, but not the home team, you can do that with
an expression like this.

    ,d1

The part before the comma is empty.

You can read more about the supported regular expression syntax here.

   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp

## RANDOMNESS

If you like the randomize the schedule as much as possible, use the --random flag.

    node robin.js --venues=5 --verbose --output=schedule.csv --random

If you run it several times, you should see differences in the schedule. Without the --random
flag, you'll see the same schedule very time if you use the same flags. Note that using
the --random flag will not enable the scheduler to violate any constraints specified via
the init?.csv files or other file specified via the --pattern flag.

## SISTER MATCHES

If you would like to omit the match against the sister team, you can do that via the --sister flag.

    node robin.js --venues=5 --verbose --output=schedule.csv --random --sister=none

If you would like to add an additional match against the sister team in order to keep the number
of home and away games equal, you can do that using the --sister=both flag. In this case,
there will be a week 1 match against the sister team as well as a final week match against
that same team.

    node robin.js --venues=5 --verbose --output=schedule.csv --random --sister=both

If you use the --weeks flag to specify an odd number of weeks, then one team of each pair
of teams will have one more home match than the other. For example, if you use --weeks=7,
then a1 may have 4 home games, in which case a2 would have 3 home games. The sister match can
be good for evening up home and away games.

    node robin.js --venues=5 --verbose --output=schedule.csv --random --sister=last --weeks=7

## CUSTOM NAMES

If you would like to use the short codes for the actual venues and teams, you can do that by
using the --names flag to specify a file which contains the actual names. Look at the names5.csv
file as an example.

~~~
ACE SLAP DOOM
C80 QP PACK
WBUF TEAM YAK
RBOT KOR SHOTS
VTAP AB STALL
~~~

In this case, there are five venues ACE, C80, WBUF, RBOT, and VTAP. The ACE venue has two home
teams, SLAP and DOOM. The C80 venue has QP and PACK as its home teams. Be sure to include
a line for each venue. It works best to use meaningful one word nicknames for venues and
teams.

    node robin.js --venues=5 --verbose --output=schedule.csv --names=names5.csv

In this case, the output will begin something like this.

~~~
"Found a schedule!"
week	venue	home	away
1	ACE	DOOM	AB
1	C80	QP	SHOTS
1	WBUF	YAK	PACK
~~~

If you would like to assign a different venue to A, just enter your venues and teams
in a different order.
