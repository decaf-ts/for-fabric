/**
 * @memberOf module:ts-workspace
 * @summary A simple CLI countdown timer
 * @description This script demonstrates a basic command-line interface (CLI) that counts down from 60 seconds and then exits.
 * It serves as a minimal example of how to create a CLI application using TypeScript.
 *
 * @example
 * // Run the script
 * node cli.js
 *
 * @mermaid
 * sequenceDiagram
 *   participant User
 *   participant CLI
 *   participant Timer
 *   User->>CLI: Run script
 *   CLI->>User: Display initial message
 *   CLI->>Timer: Start countdown
 *   loop Every second
 *     Timer->>CLI: Decrement counter
 *     CLI->>User: Display current count
 *   end
 *   Timer->>CLI: Counter reaches 0
 *   CLI->>User: Exit process
 *
 * @function iterator
 * @description A recursive function that manages the countdown timer.
 * It uses setTimeout to create a delay of 1 second between each count.
 * The function decrements the counter, logs the current count, and calls itself
 * until the counter reaches 0. When the counter reaches 0, the process exits.
 *
 * @var {number} counter - The countdown timer, initialized to 60 seconds.
 *
 * @see {@link https://nodejs.org/api/process.html#process_process_exit_code|Node.js process.exit()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/setTimeout|MDN setTimeout()}
 */

let counter = 60;
console.log(`This is a poor example of a cli. will stop in ${60} seconds`,);

function iterator() {
  setTimeout(() => {
    if (!--counter) process.exit(1,);
    console.log(counter,);
    iterator();
  }, 1000,);
}

iterator();
