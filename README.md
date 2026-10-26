# Motor Equity Compass

Help me convert my code in apps script to a more mobile friendly android app

<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ownership & Equity Digital Twin | Dealership Desk</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            slate: { 850: '#151f32', 900: '#0f172a', 950: '#080d1a' }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #080d1a; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
    input[type="range"] { accent-color: #3b82f6; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
  </style>
</head>
<body class="min-h-screen p-4 md:p-6">
<header class="max-w-7xl mx-auto mb-6 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
<h1>Automotive Ownership & Equity Digital Twin</h1>
<p>Live Sheet Schema: 10/21/26 · Public EPA MPG + RepairPal/CarEdge TCO Engine</p>
<input id="stockSearchInput" type="text" placeholder="Enter Stock # (e.g. 1-78825NA, 2-48134)" />
<button onclick="handleStockLookup()">Load Stock #</button>
<button onclick="toggleModal('inventoryModal')">Browse Sheet</button>
<button onclick="toggleModal('pasteModal')">+ Paste Sheet Rows</button>
<div id="quickStockPills"></div>
</header>
<main class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
<section class="lg:col-span-5 space-y-5">
<div><h2 id="propTitle">2026 Buick Encore GX AWD Preferred</h2><span id="propStockBadge">#2-48134</span><div id="propMiles">11,604 mi</div><div id="propVin">KL4AMCSL0TB008832</div><div id="propMpgBadge">27 MPG Comb</div><div id="propMpgSplit">26 City / 28 Hwy</div><div id="propMaintBadge">$58 / mo</div><div id="propEngineDesc">Gas 1.3L</div><div id="propDaysBadge">39 Days</div><div id="propLocBadge">In Stock (S)</div>
<label>Selling Price ($)</label><span id="priceValLabel">$23,999</span><input id="priceSlider" type="range" min="10000" max="75000" step="250" value="23999" oninput="updateSimulation()" />
<label>Cash Down + Net Trade</label><span id="downValLabel">$2,500</span><input id="downSlider" type="range" min="-5000" max="20000" step="250" value="2500" oninput="updateSimulation()" />
<label>APR (%)</label><span id="aprValLabel">6.9%</span><input id="aprSlider" type="range" min="1.9" max="18.9" step="0.25" value="6.9" oninput="updateSimulation()" />
<select id="termSelect"><option value="48">48 Months</option><option value="60">60 Months</option><option value="72" selected>72 Months</option><option value="84">84 Months</option></select>
<input id="propMpgInput" type="number" value="27" /><input id="propMaintInput" type="number" value="58" /></div>
<div><h3 id="baseTitle">Customer's Current Trade / Daily Driver</h3><span id="commuteLabel">42 mi/day (15,330 mi/yr)</span><input id="commuteSlider" type="range" min="10" max="120" step="2" value="42" oninput="updateSimulation()" />
<input id="currPayInput" type="number" value="310" /><input id="currMpgInput" type="number" value="18" /><input id="currMaintInput" type="number" value="165" /><input id="gasPriceInput" type="number" value="3.45" /><input id="insDeltaInput" type="number" value="18" /></div>
</section>
<section class="lg:col-span-7 space-y-5">
<div><div id="kpiLoanPayment">$398 / mo</div><div id="kpiStickerDelta">+$88/mo vs current payment</div><div id="kpiMonthlySavings">-$159 / mo</div><div id="kpiGasRepairSplit">Saves $70 gas + $107 maint</div><div id="kpiNetTotal">$598 / mo</div><div id="kpiTrueDelta">Saves $71/mo in real cash flow!</div></div>
<div><div id="barCurrTotalLabel">$719 / mo</div><div id="barPropTitleLabel">Proposed Stock #2-48134 Total Outflow</div><div id="barPropTotalLabel">$648 / mo</div></div>
<div><h3>Equity Crossover & Depreciation Twin</h3><div id="breakevenBadge">Positive Equity at Month 28</div><svg id="equitySvg" viewBox="0 0 600 210"></svg><strong id="scrubMonthLabel">Month 36 (Year 3)</strong><strong id="scrubEquityStatus">+$1,840 Trade Equity</strong><input id="monthScrubber" type="range" min="1" max="72" value="36" oninput="updateSimulation()" /><strong id="scrubVal">$14,900</strong><strong id="scrubLoan">$13,060</strong><strong id="scrubOdo">57,594 mi</strong></div>
<p id="closingScript"></p>
</section>
</main>
<div id="inventoryModal" class="hidden"><h3>Google Sheets Inventory</h3><input id="modalFilterInput" oninput="renderInventoryTable()" /><table><tbody id="inventoryTableBody"></tbody></table></div>
<div id="pasteModal" class="hidden">

It's all I have. You'll have to help me finish it. But here's the URL https://script.google.com/macros/s/AKfycbydnekfH2pMyWo2mqBYPuHX5Sp9HQ4uR5D48WA3dgB4/dev

/**
 * Add a custom menu to the Google Sheet to run public MPG/Maintenance enrichment
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ Digital Twin Sync')
    .addItem('Enrich Current Tab (Cols M-O)', 'enrichInventoryTab')
    .addToUi();
}

/**
 * 1. WEB APP ENDPOINT: Serves the newest sheet tab as live JSON to your Desk Simulator
 * Deploy as: Web App -> Execute as: Me -> Who has access: Anyone
 */
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  const inventory = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const loc = String(row[1] || '').trim();
    const stock = String(row[2] || '').trim();
    const year = parseInt(row[3]);
    const model = String(row[4] || '').trim();
    const desc = String(row[5] || '').trim();
    const miles = parseInt(String(row[6]).replace(/,/g, '')) || 0;
    const price = parseInt(String(row[7]).replace(/[$,]/g, '')) || 0;
    const days = parseInt(row[8]) || 0;
    const stat = String(row[9] || '').trim();
    const vin = String(row[10] || '').trim();
    const epaMpg = parseFloat(row[12]) || null;
    const estMaint = parseFloat(row[13]) || null;
    if (stock && !isNaN(year) && model) {
      inventory.push({sheetTab: sheet.getName(), loc: loc || 'LOT', stock, year, makeModel: model, desc, miles, price, days, stat, vin, epaMpg, estMaint});
    }
  }
  return ContentService.createTextOutput(JSON.stringify({updated: new Date().toISOString(), tabName: sheet.getName(), count: inventory.length, vehicles: inventory})).setMimeType(ContentService.MimeType.JSON);
}
function enrichInventoryTab() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const headerRow = data[0][2] === 'Stock' ? 1 : 4;
  sheet.getRange(headerRow, 13, 1, 3).setValues([['Public Comb MPG', 'Est Maint ($/mo)', 'VIN Engine Spec']]);
  for (let i = headerRow; i < data.length; i++) {
    const vin = String(data[i][10] || '').trim();
    const existingMpg = data[i][12];
    if (vin.length === 17 && !existingMpg) {
      const specs = fetchPublicSpecsByVin(vin, data[i][6]);
      sheet.getRange(i + 1, 13, 1, 3).setValues([[specs.mpg, specs.monthlyMaint, specs.engineSummary]]);
      SpreadsheetApp.flush();
    }
  }
}
function fetchPublicSpecsByVin(vin, miles) {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`;
    const res = JSON.parse(UrlFetchApp.fetch(url).getContentText());
    const v = res.Results[0] || {};
    const make = (v.Make || '').toUpperCase();
    const displ = parseFloat(v.DisplacementL) || 2.5;
    const cylinders = parseInt(v.EngineCylinders) || 4;
    const fuel = (v.FuelTypePrimary || 'Gasoline');
    const drive = (v.DriveType || '');
    let estMpg = 25;
    if (cylinders >= 8) estMpg = displ > 6.0 ? 15 : 17;
    else if (cylinders === 6) estMpg = drive.includes('4WD') || drive.includes('AWD') ? 20 : 22;
    else if (cylinders <= 4) estMpg = displ <= 1.5 ? 29 : (drive.includes('AWD') ? 25 : 28);
    const brandBaseAnnual = {'TOYOTA': 490, 'HONDA': 510, 'HYUNDAI': 540, 'KIA': 560, 'BUICK': 610, 'FORD': 710, 'CHEVROLET': 730, 'GMC': 740, 'DODGE': 820, 'CHRYSLER': 760, 'RAM': 850, 'JEEP': 790}[make] || 680;
    const odo = parseInt(String(miles).replace(/,/g, '')) || 15000;
    const mileageFactor = 1 + Math.max(0, (odo - 5000) / 40000) * 0.5;
    const monthlyMaint = Math.round((brandBaseAnnual * mileageFactor) / 12);
    return {mpg: estMpg, monthlyMaint, engineSummary: `${displ}L ${cylinders}-Cyl (${fuel})`};
  } catch (err) {
    return {mpg: 23, monthlyMaint: 65, engineSummary: 'Standard Spec'};
  }
}

/** Google Sheets bound Apps Script dashboard loader */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚡ Ownership Twin').addItem('Launch Desk Simulator', 'openTwinDashboard').addToUi();
}
function openTwinDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('index').setWidth(1240).setHeight(840);
  SpreadsheetApp.getUi().showModalDialog(html, 'Ownership & Equity Digital Twin');
}
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index').setTitle('Dealership Ownership & Equity Digital Twin').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function getSheetInventoryData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  const units = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const colOffset = (String(row[2] || '').trim() !== '' && !isNaN(parseInt(row[3]))) ? 0 : 1;
    const loc = colOffset === 0 ? String(row[1] || 'LOT').trim() : 'LOT';
    const stock = String(row[2 + colOffset] || '').trim();
    const year = parseInt(row[3 + colOffset]);
    const model = String(row[4 + colOffset] || '').trim();
    const desc = String(row[5 + colOffset] || '').trim();
    const miles = parseInt(String(row[6 + colOffset]).replace(/,/g, '')) || 0;
    const price = parseInt(String(row[7 + colOffset]).replace(/[$,]/g, '')) || 0;
    const days = parseInt(row[8 + colOffset]) || 0;
    const stat = String(row[9 + colOffset] || 'S').trim();
    const vin = String(row[10 + colOffset] || '').trim();
    if (stock && stock.toLowerCase() !== 'stock' && !isNaN(year) && model && price > 0) {
      units.push({loc: loc || 'LOT', stock, year, makeModel: model, desc, miles, price, days, stat, vin, pics: 0});
    }
  }
  return {tabName: sheet.getName(), units};
}

// Live VIN decoder + EPA API logic
const APPS_SCRIPT_WEB_APP_URL = "";
async function fetchLivePublicVehicleData(unit) {
  if (!unit.vin || unit.vin.length < 11) return;
  const statusEl = document.getElementById("propEngineDesc");
  if (statusEl) statusEl.textContent = "Querying NHTSA & EPA APIs...";
  try {
    const nhtsaRes = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${unit.vin}?format=json`);
    const nhtsaData = await nhtsaRes.json();
    const v = nhtsaData.Results?.[0];
    if (v && v.Make) {
      const year = v.ModelYear || unit.year;
      const make = v.Make;
      const model = v.Model;
      let epaComb = null, epaCity = null, epaHwy = null;
      try {
        const menuUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`;
        const menuRes = await fetch(menuUrl, {headers: {"Accept": "application/json"}});
        if (menuRes.ok) {
          const menuJson = await menuRes.json();
          const firstOption = Array.isArray(menuJson.menuItem) ? menuJson.menuItem[0] : menuJson.menuItem;
          if (firstOption?.value) {
            const vehRes = await fetch(`https://www.fueleconomy.gov/ws/rest/vehicle/${firstOption.value}`, {headers: {"Accept": "application/json"}});
            const vehJson = await vehRes.json();
            epaComb = parseInt(vehJson.comb08);
            epaCity = parseInt(vehJson.city08);
            epaHwy = parseInt(vehJson.highway08);
          }
        }
      } catch (e) {}
      if (epaComb && !isNaN(epaComb)) {
        unit.combMpg = epaComb; unit.cityMpg = epaCity || epaComb - 2; unit.hwyMpg = epaHwy || epaComb + 3;
      }
      updateSimulation();
    }
  } catch (err) { console.warn("Live VIN lookup fallback used:", err); }
}

Installable web app (PWA)
Anyone with link

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://motor-equity-compass.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ab438218-ceaa-4474-aa2d-b8b871974b47).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
