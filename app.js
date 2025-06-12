const BASE_URL = "http://127.0.0.1:5000";
const output = document.getElementById("output");

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

// Start OTP
async function startOptimizedCharging() {
  log("loading battery info...");
  const [info, baseLoad, prices] = await Promise.all([
    getInfo(),
    getBaseLoad(),
    getPricePerHour()
  ]);

    const currentBattery = info.ev_battery_kwh;
    const batteryCapacity = 46.3;
    const currentPercent = info.battery_percent;
    const targetKWh = (80 - currentPercent) / 100 * batteryCapacity;

  log(`Battery: ${currentPercent.toFixed(1)}% - Charge Needed: ${targetKWh.toFixed(2)} kWh`);

  // Calculate hours safe to charge (consumption < 3.6kW)
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

  // Simulation
  for (let i = 0; i < 24; i++) {
    if (selectedHours.find(h => h.hour === i)) {
      await startToCharge();
      log(`${i}:00 - Charging...`);
      await new Promise(r => setTimeout(r, 1000));
      await endCharge();
    } else {
      log(`${i}:00 - Not charging.`);
    }
  }

  log("Charging complete... battery full :)");
}
