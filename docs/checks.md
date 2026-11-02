# Verification checks

The checks a contributor runs against a real scale. Each check has an ID, the
action, and a pass rule written before it is run. The live harnesses record
the bytes; the contributor records what the scale's display or vendor app
showed, because that is the half of the evidence a recording can't hold.

## Outcomes

- **pass:** the observed behaviour meets the pass rule.
- **fail:** it doesn't.
- **unverified:** not run, or the result couldn't be judged.
- **unsupported:** the driver declares the capability missing. Silence alone
  never proves a feature is unsupported.

## Running a check

Connect, run one check, export with the check ID as the scenario (for example
`C8-physical-tare`), then disconnect. Each connection starts a new recording,
so each fixture proves one thing. Note what the display or app showed and
roughly when you acted.

## Checks

| ID  | Check                | Action                                                                 | Pass rule                                                                                |
| --- | -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| C1  | Connect              | Connect the scale                                                      | Ready within 5 s                                                                         |
| C2  | Keeps streaming      | Leave it untouched for 60 s                                            | No errors and no gap between readings over 1 s                                           |
| C3  | Zero                 | Empty scale                                                            | Shows 0 to the scale's resolution and stable, as the display does                        |
| C4  | Known weights        | Weigh three objects (light, medium, heavy) one at a time               | Each settled reading equals the display to the scale's resolution                        |
| C5  | Settling             | Put an object on and watch                                             | Stable clears while the load changes and returns once it settles; note how long it takes |
| C6  | Negative             | Object on, tare, remove it                                             | Shows minus the object's weight, as the display does                                     |
| C7  | Tare from the app    | Object on, tare from the harness                                       | Display and readings show 0 within 1 s                                                   |
| C8  | Tare from the scale  | Object on, press the scale's tare button                               | Readings show 0; note whether a button event arrives                                     |
| C9  | Timer from the scale | Start the scale's timer, wait 10 s on a stopwatch, stop, reset         | Timer events show running, about 10 s (±0.5 s) when stopped, then 0; note button events  |
| C10 | Timer from the app   | Start, stop and reset from the harness                                 | The display's timer follows each command                                                 |
| C11 | Battery              | Note the battery shown by the vendor app or display                    | The reported percentage equals it                                                        |
| C12 | Units                | Switch the scale to ounces, weigh the C4 object, switch back           | Observation: record what arrives                                                         |
| C13 | Steady pour          | Pour steadily for about 20 s on a stopwatch; note start and end weight | Computed flow matches weight change over time within the documented tolerance            |
| C14 | Pour stops           | Stop pouring and wait 10 s                                             | Flow settles to about 0                                                                  |
| C15 | Drop                 | Switch the scale off while connected                                   | Reported disconnected within a few seconds, without repeated errors                      |
| C16 | Reconnect            | Switch it on and reconnect                                             | Ready again, with a fresh session                                                        |
| C17 | Two scales           | Connect two; tare one; switch one off                                  | Only the targeted scale changes, and the other keeps streaming                           |
| C18 | Identity             | Note model, model year and firmware from the vendor app                | Information for the fixture header; never record a serial number                         |

Tolerances and timing values used by automated checks are named constants in
the harness.
