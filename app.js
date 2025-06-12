const BASE_URL = "http://127.0.0.1:5000";
const output = document.getElementById("output");

let chargingEnabled = true;
let storedBatteryKWh = null;

function log(msg) {
  output.innerHTML += `<p>${msg}</p>`;
}

// Fetch simulation info
async function getInfo() {
  try {
    const response = await fetch(`${BASE_URL}/info`);
    const data = await response.json();

    const currentBatteryKWh = data.battery_capacity_kWh; 
    const batteryCapacity = 46.3; 
    const percent = (currentBatteryKWh / batteryCapacity) * 100;

    return {
      battery_percent: percent,
      charging: data.ev_battery_charge_start_stopp,
      ev_battery_kwh: currentBatteryKWh
    };
  } catch (e) {
    log("Error getting info");
    return null;
  }
}

// Fetch hourly household consumption
async function getBaseLoad() {
  const res = await fetch(`${BASE_URL}/baseload`);
  return await res.json();
}

// Fetch hourly electricity price
async function getPricePerHour() {
  const res = await fetch(`${BASE_URL}/priceperhour`);
  return await res.json();
}

// Start charging
async function startToCharge() {
  await fetch(`${BASE_URL}/charge`, { method: "POST" });
  log("Charging started...");
}

// Stop charging
async function endCharge() {
  await fetch(`${BASE_URL}/charge`, { method: "DELETE" });
  log("Charging stopped");
}

function enableCharging() {
  chargingEnabled = true;
  log("Charging enabled... Starting optimized charging...");
  startOptimizedCharging();  
}

function disableCharging() {
  chargingEnabled = false;
  endCharge(); 
  if (currentBattery !== null) {
    storedBatteryKWh = currentBattery;
    log(`Charging paused. Battery at ${((storedBatteryKWh / 46.3) * 100).toFixed(1)}%`);
  }
}

async function dischargeBattery() {
  await fetch(`${BASE_URL}/discharge`, { method: "POST" });
  storedBatteryKWh = 0.2 * 46.3;
  log("Battery discharged to 20%");
}

let currentBattery = null;

// Start OTP

async function startOptimizedCharging() {
  if (!chargingEnabled) {
    log("Charging is off. Click Start Charging to continue.");
    return;
  }

  const [info, baseLoad, prices] = await Promise.all([
    getInfo(),
    getBaseLoad(),
    getPricePerHour()
  ]);

  const batteryCapacity = 46.3;

  // Start from stored value if available
  currentBattery = storedBatteryKWh !== null ? storedBatteryKWh : info.ev_battery_kwh;
  let currentPercent = (currentBattery / batteryCapacity) * 100;
  const targetKWh = (80 - currentPercent) / 100 * batteryCapacity;

  if (currentPercent >= 100) {
    log("Battery full");
    return;
  }

  log(`Battery: ${currentPercent.toFixed(1)}% - Charge Needed: ${targetKWh.toFixed(2)} kWh`);

  let hours = [];
  for (let i = 0; i < baseLoad.length; i++) {
    const totalLoadIfCharging = baseLoad[i] + 7.4;
    if (totalLoadIfCharging <= 11) {
      hours.push({
        hour: i,
        baseLoad: baseLoad[i],
        price: prices[i]
      });
    }
  }

  hours.sort((a, b) => a.price - b.price);
  const hoursNeeded = Math.ceil(targetKWh / 7.4);
  const selectedHours = hours.slice(0, hoursNeeded);

  log(`Selected charging hours: ${selectedHours.map(h => h.hour).join(", ")}`);

  let batteryFull = false;

  for (let i = 0; i < 24; i++) {
    if (!chargingEnabled) {
      log("Charging stopped mid-process... battery not full :(");
      break;
    }

    const homeLoad = baseLoad[i];
    const isCharging = selectedHours.find(h => h.hour === i);
    const price = prices[i];
    let totalLoad = homeLoad;

    if (isCharging) {
      await startToCharge();
      currentBattery += 7.4;
      if (currentBattery > batteryCapacity) currentBattery = batteryCapacity;
      currentPercent = (currentBattery / batteryCapacity) * 100;
      totalLoad += 7.4;

      log(`${i}:00 - Charging | Price: ${price.toFixed(2)} kr | Load: ${homeLoad.toFixed(2)} + 7.4 = ${totalLoad.toFixed(2)} kW | Battery: ${currentPercent.toFixed(1)}%`);

      await new Promise(r => setTimeout(r, 1000));
      await endCharge();

      if (currentPercent >= 100) {
        log("Battery full");
        batteryFull = true;
        break;
      }
    } else {
      log(`${i}:00 - Not Charging | Price: ${price.toFixed(2)} kr | Load: ${homeLoad.toFixed(2)} kW | Battery: ${currentPercent.toFixed(1)}%`);
    }
  }

  if (batteryFull) {
    log(`Charging complete...  Battery: ${currentPercent.toFixed(1)}%`);
  }
}