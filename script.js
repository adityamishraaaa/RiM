/****************************************************
 * script.js
 ****************************************************/

/* DOM References (tracker.html) */
const stepCountEl = document.getElementById('step-count');
const distanceTraveledEl = document.getElementById('distance-traveled');
const sedentaryEl = document.getElementById('sedentary-hours');
const sleepHoursEl = document.getElementById('sleep-hours');

/****************************************************
 * DAILY Variables
 * We reset these to 0 each day after saving to CSV
 ****************************************************/
let dailyStepCount = 0;
let dailyDistance = 0;           // in km
let dailySedentaryMinutes = 0;
let dailySleepHours = 0;         // auto-detected
// For step detection
let previousAcceleration = { x: null, y: null, z: null };
let isStepDetected = false;

// For sedation
let lastActiveTime = Date.now();

// For auto-sleep detection
// We track "continuous inactivity chunks" in the 10 PM -> 10 AM window
let sleepCandidateActive = false;      // Are we currently in an inactivity chunk?
let sleepCandidateMinutes = 0;         // Length (in min) of current inactivity chunk
const SLEEP_THRESHOLD_MINUTES = 180;   // 3 hours
const SLEEP_WINDOW_START = 22;         // 10 PM
const SLEEP_WINDOW_END = 10;           // 10 AM

/****************************************************
 * 1) Load/Save daily data from localStorage
 ****************************************************/
function loadDailyDataFromStorage() {
  const storedDaily = localStorage.getItem('dailyData');
  if (!storedDaily) return; // Nothing saved yet

  const data = JSON.parse(storedDaily);
  dailyStepCount = data.dailyStepCount || 0;
  dailyDistance = data.dailyDistance || 0;
  dailySedentaryMinutes = data.dailySedentaryMinutes || 0;
  dailySleepHours = data.dailySleepHours || 0;

  updateUI();
}

function saveDailyDataToStorage() {
  const toStore = {
    dailyStepCount,
    dailyDistance,
    dailySedentaryMinutes,
    dailySleepHours
  };
  localStorage.setItem('dailyData', JSON.stringify(toStore));
}

function updateUI() {
  if (stepCountEl) stepCountEl.textContent = dailyStepCount.toString();
  if (distanceTraveledEl) distanceTraveledEl.textContent = dailyDistance.toFixed(2);

  // Sedentary in hours
  const sedHours = (dailySedentaryMinutes / 60).toFixed(1);
  if (sedentaryEl) sedentaryEl.textContent = sedHours;

  // Sleep (auto-detected) in hours
  if (sleepHoursEl) sleepHoursEl.textContent = dailySleepHours.toFixed(1);
}

/****************************************************
 * 2) Step Counting via DeviceMotion
 ****************************************************/
const stepThreshold = 1.2; // for motion magnitude
const stepLength = 0.8;    // meters

function requestMotionPermission() {
  if (
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function'
  ) {
    DeviceMotionEvent.requestPermission()
      .then((response) => {
        if (response === 'granted') {
          window.addEventListener('devicemotion', handleMotion, true);
        } else {
          console.warn('DeviceMotion permission not granted.');
        }
      })
      .catch(console.error);
  } else {
    // No special permission needed in some browsers
    window.addEventListener('devicemotion', handleMotion, true);
  }
}

function handleMotion(event) {
  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration) return;

  const { x, y, z } = acceleration;
  if (
    previousAcceleration.x !== null &&
    previousAcceleration.y !== null &&
    previousAcceleration.z !== null
  ) {
    const deltaX = Math.abs(x - previousAcceleration.x);
    const deltaY = Math.abs(y - previousAcceleration.y);
    const deltaZ = Math.abs(z - previousAcceleration.z);

    const magnitude = deltaX + deltaY + deltaZ;
    if (magnitude > stepThreshold && !isStepDetected) {
      // A step was detected
      dailyStepCount++;
      lastActiveTime = Date.now(); // user is active
      dailyDistance = (dailyStepCount * stepLength) / 1000; // km

      // Also break any "sleepCandidate" chunk if it was active
      if (sleepCandidateActive) {
        finalizeSleepCandidate(); // user moved, finalize chunk
      }

      updateUI();
      saveDailyDataToStorage();

      isStepDetected = true;
      setTimeout(() => { isStepDetected = false; }, 300);
    }
  }
  previousAcceleration = { x, y, z };
}

/****************************************************
 * 3) Sedentary + Sleep Checking
 ****************************************************/
function checkInactivity() {
  // 1) Sedentary
  const now = Date.now();
  const diffMinutes = (now - lastActiveTime) / (1000 * 60);

  // If user hasn't moved for at least 1 minute, add that to sedentary
  if (diffMinutes >= 1) {
    const add = Math.floor(diffMinutes); // e.g., if 2 minutes have passed
    dailySedentaryMinutes += add;
    lastActiveTime = now; // reset reference
    updateUI();
    saveDailyDataToStorage();
  }

  // 2) Sleep detection (only if in [22..24] or [0..10] hours range)
  const currentHour = new Date().getHours();
  const inSleepWindow = isInSleepWindow(currentHour);

  if (inSleepWindow) {
    // Check if user was inactive in the last minute (same condition as above)
    // If diffMinutes >= 1 => user didn't move in that minute
    // We'll accumulate a continuous chunk
    if (!sleepCandidateActive) {
      // Start a new chunk
      sleepCandidateActive = true;
      sleepCandidateMinutes = 0;
    }

    // Since we do once per minute, we can add 1 to our chunk
    sleepCandidateMinutes += 1;
  } else {
    // If we're out of the sleep window but a chunk was active, finalize it
    if (sleepCandidateActive) {
      finalizeSleepCandidate();
    }
  }
}

function isInSleepWindow(hour) {
  // Sleep window is 22:00 -> 24:00 and 0:00 -> 10:00
  // So if hour >= 22 OR hour < 10
  return (hour >= SLEEP_WINDOW_START || hour < SLEEP_WINDOW_END);
}

// Called when user moves or we exit the sleep window
function finalizeSleepCandidate() {
  // If we have 180+ min, add to dailySleepHours
  if (sleepCandidateMinutes >= SLEEP_THRESHOLD_MINUTES) {
    dailySleepHours += sleepCandidateMinutes / 60.0; // convert minutes -> hours
  }
  // Reset
  sleepCandidateActive = false;
  sleepCandidateMinutes = 0;

  updateUI();
  saveDailyDataToStorage();
}

/****************************************************
 * 4) Meal Popup (10 PM)
 ****************************************************/
let hasShownMealPopupToday = false;

function showMealPopup() {
  const popup = document.getElementById('meal-popup');
  if (popup) popup.style.display = 'block';
}

function hideMealPopup() {
  const popup = document.getElementById('meal-popup');
  if (popup) popup.style.display = 'none';
}

function setupNightlyMealCheck() {
  // Check time every minute
  setInterval(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Show popup at 22:00
    if (hours === 22 && minutes === 0 && !hasShownMealPopupToday) {
      showMealPopup();
      hasShownMealPopupToday = true;
    }

    // Reset for next day at 00:00
    if (hours === 0 && minutes === 0) {
      hasShownMealPopupToday = false;
    }

    // Also check if it's 23:59 -> store daily CSV row & reset daily counters
    if (hours === 23 && minutes === 59) {
      // Wait a few seconds so meal answers can be recorded if user changed them at 22:00
      setTimeout(() => {
        // If we are still in a "sleepCandidate" chunk at midnight, finalize it 
        // (in case they've begun inactivity before midnight).
        if (sleepCandidateActive) {
          finalizeSleepCandidate();
        }
        storeDailyDataInCSV();
        resetDailyCounters();
      }, 30000); // store after 30s (23:59:30)
    }

  }, 60 * 1000);
}

function handleMealPopupSubmit() {
  const breakfastVal = document.querySelector('input[name="breakfast"]:checked')?.value;
  const lunchVal = document.querySelector('input[name="lunch"]:checked')?.value;
  const dinnerVal = document.querySelector('input[name="dinner"]:checked')?.value;

  // Convert "yes" -> 1, "no" -> 0
  const breakfast = (breakfastVal === 'yes') ? 1 : 0;
  const lunch = (lunchVal === 'yes') ? 1 : 0;
  const dinner = (dinnerVal === 'yes') ? 1 : 0;

  // Store in localStorage with today's date as key
  const todayKey = new Date().toISOString().split('T')[0];
  const mealData = { breakfast, lunch, dinner };
  localStorage.setItem(`mealData-${todayKey}`, JSON.stringify(mealData));

  hideMealPopup();
}

/****************************************************
 * 5) CSV Storage
 ****************************************************/
function storeDailyDataInCSV() {
  let csvContent = localStorage.getItem('csvData') || '';

  // If empty, prepend header
  if (!csvContent) {
    csvContent = 'Date,step count,Distance,sedentary hours,sleep hours,breakfast,lunch,dinner,age,gender,height,weight\n';
  }

  // Gather today's data
  const now = new Date();
  const day = String(now.getDate()).padStart(2,'0');
  const month = String(now.getMonth()+1).padStart(2,'0');
  const year = now.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  // breakfast/lunch/dinner
  const todayKey = now.toISOString().split('T')[0];
  const mealDataStr = localStorage.getItem(`mealData-${todayKey}`);
  let breakfast = 0, lunch = 0, dinner = 0;
  if (mealDataStr) {
    const mealObj = JSON.parse(mealDataStr);
    breakfast = mealObj.breakfast || 0;
    lunch = mealObj.lunch || 0;
    dinner = mealObj.dinner || 0;
  }

  // Age, gender, height, weight
  const userDataStr = localStorage.getItem('userData');
  let age=0, gender='unknown', height=0, weight=0;
  if (userDataStr) {
    const userObj = JSON.parse(userDataStr);
    age = userObj.age || 0;
    gender = userObj.gender || 'unknown';
    height = userObj.height || 0;
    weight = userObj.weight || 0;
  }

  // Convert sedentary to hours
  const sedentaryHours = (dailySedentaryMinutes / 60).toFixed(1);

  // Build CSV line
  // Date,stepCount,Distance,sedentaryHours,sleepHours,breakfast,lunch,dinner,age,gender,height,weight
  const line = [
    dateStr,
    dailyStepCount,
    dailyDistance.toFixed(2),
    sedentaryHours,
    dailySleepHours.toFixed(1),
    breakfast,
    lunch,
    dinner,
    age,
    gender,
    height,
    weight
  ].join(',');

  csvContent += line + '\n';
  localStorage.setItem('csvData', csvContent);

  console.log('Daily data appended to CSV:\n', line);
}

function resetDailyCounters() {
  dailyStepCount = 0;
  dailyDistance = 0;
  dailySedentaryMinutes = 0;
  dailySleepHours = 0;

  // Also reset any active inactivity chunk
  sleepCandidateActive = false;
  sleepCandidateMinutes = 0;

  // Clear today's meal data
  const todayKey = new Date().toISOString().split('T')[0];
  localStorage.removeItem(`mealData-${todayKey}`);

  updateUI();
  saveDailyDataToStorage();
}

/****************************************************
 * 6) Initialize
 ****************************************************/
window.addEventListener('load', () => {
  // If these elements do not exist, we're likely not on tracker.html
  if (stepCountEl && distanceTraveledEl && sedentaryEl && sleepHoursEl) {
    loadDailyDataFromStorage();

    // Ask for motion permission
    requestMotionPermission();

    // Inactivity check every minute for sedentary + sleep detection
    setInterval(checkInactivity, 60 * 1000);

    // Setup meal popup schedule + daily CSV
    setupNightlyMealCheck();

    // Meal Popup "Submit" button
    const mealPopupSubmitBtn = document.getElementById('meal-popup-submit');
    if (mealPopupSubmitBtn) {
      mealPopupSubmitBtn.addEventListener('click', handleMealPopupSubmit);
    }
  }
});
