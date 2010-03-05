/**
 * A very very simple synchronization utility for instances where you know
 * exactly how many asynchronous functions you're waiting for.  Simply
 * pass it the number (N) and a result callback.  The callback will be fired
 * once the returned function has been called N times.
 *
 * Example:
 *
 * var tick = ticker(3, function(){
 *   sys.puts("We did something 3 times, yipee.");
 * });
 *
 * some_async_call(function(){ tick(); });
 * some_async_call(function(){ tick(); });
 * some_async_call(function(){ tick(); });
 *
 * After all 3 async calls complete, the final callback will be executed.
 */

exports.ticker = function(num, resultCallback) {
	return function() { if(--num < 1) resultCallback(); }
}

