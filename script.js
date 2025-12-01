import { CONTRACT_ADDRESS, ABI } from "./abi.js"; // นำเข้าที่อยู่สัญญา (Contract Address) และ ABI (Application Binary Interface) จากไฟล์ abi.js

let provider; // ตัวแปรสำหรับเก็บ Provider (ใช้ในการอ่านข้อมูลจาก Blockchain)
let signer; // ตัวแปรสำหรับเก็บ Signer (ใช้ในการส่งธุรกรรม/ทำรายการที่ต้องเซ็นชื่อ)
let contract; // ตัวแปรสำหรับเก็บ Contract (อินสแตนซ์ของสัญญาที่ใช้ในการเรียกฟังก์ชัน)
let currentAccount = null; // ตัวแปรสำหรับเก็บที่อยู่ Wallet ปัจจุบันที่เชื่อมต่อ
let contractOwnerAddress = null; // ตัวแปรสำหรับเก็บที่อยู่ Wallet ของเจ้าของสัญญา (Owner)

// ============================================================
// 1. SYSTEM & INITIALIZATION (AUTO LOAD) - ระบบและการเริ่มต้น (โหลดอัตโนมัติ)
// ============================================================

// โหลดข้อมูล Dropdown ทันทีเมื่อเปิดเว็บ
async function loadDropdowns() {
    console.log("Loading Dropdowns...");

    // สร้าง Contract ชั่วคราว (Read-only)
    let tempContract = contract; // ลองใช้ Contract ที่เชื่อมต่อแล้ว (ถ้ามี)
    if (!tempContract) { // ถ้ายังไม่มีการเชื่อมต่อ Wallet/Contract
        if (window.ethereum) { // ตรวจสอบว่ามี MetaMask/Wallet Provider หรือไม่
            try {
                // สร้าง Provider แบบอ่านอย่างเดียวจาก MetaMask/Wallet
                const p = new ethers.BrowserProvider(window.ethereum);
                // สร้าง Contract อินสแตนซ์แบบอ่านอย่างเดียว
                tempContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, p);
            } catch (e) {
                console.error("Provider Error:", e);
                return; // เกิดข้อผิดพลาดในการสร้าง Provider ให้ออกจากฟังก์ชัน
            }
        } else {
            updateDropdownStatus("กรุณาติดตั้ง MetaMask"); // แจ้งเตือนให้ติดตั้ง MetaMask
            return;
        }
    }

    // ฟังก์ชันย่อยสำหรับอัปเดตข้อความสถานะใน Dropdown
    function updateDropdownStatus(msg) {
        const cSelect = document.getElementById("campaignSelect"); // Dropdown โครงการ
        const oSelect = document.getElementById("donateOrg"); // Dropdown มูลนิธิ
        if (cSelect) cSelect.innerHTML = `<option disabled selected>${msg}</option>`;
        if (oSelect) oSelect.innerHTML = `<option disabled selected>${msg}</option>`;
    }

    try {
        // --- 1. Campaign Dropdown (ดึงข้อมูลโครงการ) ---
        const cSelect = document.getElementById("campaignSelect");
        if (cSelect) {
            // เรียกฟังก์ชันจาก Smart Contract เพื่อดึงข้อมูลโครงการทั้งหมด
            const allCamps = await tempContract.getAllCampaigns();
            // กรองเฉพาะโครงการที่ "ใช้งานอยู่" (Active): ID ไม่ใช่ 0, ยังไม่ถูกปิด (isEnded=false), และยังไม่หมดเขต (deadline ยังไม่ถึง)
            const active = allCamps.filter(c => {
                const id = Number(c.id);
                // แปลง deadline (เป็นวินาที) ให้เป็นมิลลิวินาที
                const deadline = Number(c.deadline) * 1000;
                return id !== 0 && !c.isEnded && Date.now() < deadline;
            });

            // ตั้งค่า Dropdown เริ่มต้น
            cSelect.innerHTML = '<option value="" disabled selected>-- เลือกโครงการ --</option>';
            if (active.length === 0) {
                cSelect.innerHTML = '<option disabled>ไม่มีโครงการที่เปิดรับ</option>';
            } else {
                // วนลูปแสดงโครงการที่ใช้งานอยู่ โดยแสดงอันที่สร้างล่าสุดก่อน (reverse)
                [...active].reverse().forEach(c => {
                    const opt = document.createElement("option");
                    opt.value = c.id;
                    opt.text = `ID ${c.id}: ${c.title}`;
                    cSelect.appendChild(opt);
                });
            }
        }

        // --- 2. Org Dropdown (ดึงข้อมูลมูลนิธิ) ---
        const oSelect = document.getElementById("donateOrg");
        if (oSelect) {
            // เรียกฟังก์ชันจาก Smart Contract เพื่อดึงข้อมูลมูลนิธิทั้งหมด
            const orgs = await tempContract.getAllOrganizations();
            oSelect.innerHTML = '<option value="" disabled selected>-- เลือกมูลนิธิ --</option>';

            let hasOrg = false;
            // วนลูปแสดงเฉพาะมูลนิธิที่ได้รับการอนุมัติแล้ว (isApproved=true)
            orgs.forEach(o => {
                if (o.isApproved) {
                    const opt = document.createElement("option");
                    opt.value = o.walletAddr; // ใช้ Wallet Address เป็น Value
                    opt.text = o.name;
                    oSelect.appendChild(opt);
                    hasOrg = true;
                }
            });
            if (!hasOrg) oSelect.innerHTML = '<option disabled>ไม่มีมูลนิธิ</option>';

            // เช็ค URL Parameter เพื่อตั้งค่า Dropdown ตามลิงก์
            checkUrlParam();
        }

    } catch (e) {
        console.error("Load Error:", e);
        updateDropdownStatus("โหลดไม่ได้ (เช็ค Network)");
    }
}

// ฟังก์ชันสำหรับตรวจสอบ URL Parameters (เช่น ?donateOrg=... หรือ ?campaignId=...)
function checkUrlParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetAddress = urlParams.get('donateOrg'); // ดึงค่าที่อยู่มูลนิธิจาก URL
    const campaignId = urlParams.get('campaignId'); // ดึงค่า ID โครงการจาก URL

    const orgDropdown = document.getElementById("donateOrg");
    const campDropdown = document.getElementById("campaignSelect");
    const lockedDisplay = document.getElementById("lockedOrgName");

    // เลือก Org (ถ้ามีพารามิเตอร์ donateOrg ใน URL)
    if (targetAddress && orgDropdown && lockedDisplay) {
        orgDropdown.value = targetAddress;
        if (orgDropdown.selectedIndex > -1) {
            // ซ่อน Dropdown แล้วแสดงชื่อมูลนิธิแทน เพื่อ 'ล็อค' การบริจาคให้เป็นมูลนิธินี้
            orgDropdown.style.display = 'none';
            lockedDisplay.style.display = 'block';
            lockedDisplay.innerText = orgDropdown.options[orgDropdown.selectedIndex].text;
        }
    }

    // เลือก Campaign (ถ้ามีพารามิเตอร์ campaignId ใน URL)
    if (campaignId && campDropdown) {
        campDropdown.value = campaignId;
        const section = campDropdown.closest('.control-group');
        if (section) {
            // เลื่อนหน้าจอไปที่ส่วนควบคุมโครงการและไฮไลท์
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            section.style.border = "2px solid #e67e22";
            setTimeout(() => section.style.border = "none", 2000);
        }
    }
}

// เรียกฟังก์ชัน loadDropdowns ทันทีที่โหลดหน้าเว็บเสร็จ
window.addEventListener('DOMContentLoaded', () => {
    loadDropdowns();
});

// ============================================================
// 2. CONNECT WALLET - เชื่อมต่อ Wallet
// ============================================================

const connectBtn = document.getElementById('connectBtn');
if (connectBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มเชื่อมต่อ
    connectBtn.onclick = async () => {
        if (window.ethereum) { // ตรวจสอบว่ามี MetaMask หรือไม่
            try {
                // สร้าง Provider
                provider = new ethers.BrowserProvider(window.ethereum);
                // ร้องขอให้ผู้ใช้เชื่อมต่อ Wallet/บัญชี
                await provider.send("eth_requestAccounts", []);
                // ได้รับ Signer (สำหรับทำธุรกรรม)
                signer = await provider.getSigner();
                // สร้าง Contract อินสแตนซ์ที่เชื่อมต่อกับ Signer (สามารถทำธุรกรรมได้)
                contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
                // รับที่อยู่ Wallet ปัจจุบัน
                currentAccount = await signer.getAddress();

                await updateBalance(); // อัปเดตยอด DNT Token
                await loadDropdowns(); // โหลด Dropdown ใหม่ (เพื่อให้ใช้ Contract ที่มี Signer ได้)

                // ตรวจสอบสถานะและโหลดฟังก์ชันเพิ่มเติมตามหน้าเว็บที่อยู่
                if (document.getElementById('adminStatus')) { // ถ้าอยู่หน้า Admin
                    // สร้าง Contract อ่านอย่างเดียวเพื่อดึง Owner Address
                    const tempProvider = new ethers.BrowserProvider(window.ethereum);
                    const readOnlyContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, tempProvider);
                    contractOwnerAddress = await readOnlyContract.owner();
                    checkAdminStatus(); // ตรวจสอบว่าเป็น Owner หรือไม่
                } else if (document.getElementById('orgStatus')) { // ถ้าอยู่หน้า Org Admin
                    checkAndDisplayOrgStatus(); // ตรวจสอบและแสดงสถานะองค์กร
                }

            } catch (err) {
                alert("Connection Error: " + err.message);
            }
        } else {
            alert("Please install MetaMask");
        }
    };
}

// ฟังก์ชันสำหรับอัปเดตยอด DNT Token ใน Wallet
async function updateBalance() {
    const walletText = document.getElementById('walletAddress');
    if (!contract || !walletText) return; // ออกถ้ายังไม่ได้เชื่อมต่อ Contract หรือไม่มี Element
    try {
        // เรียกฟังก์ชัน balanceOf จาก Contract เพื่อดึงยอด DNT Token ของบัญชีปัจจุบัน
        const bal = await contract.balanceOf(currentAccount);
        // แปลง BigInt เป็นเลขทศนิยมที่มนุษย์อ่านได้ (โดยทั่วไปใช้ 18 decimal)
        const humanBal = ethers.formatUnits(bal, 18);
        // แสดงที่อยู่ Wallet และยอด Balance
        walletText.innerText = `Wallet: ${currentAccount.substring(0, 6)}... | Balance: ${parseFloat(humanBal).toFixed(2)} DNT`;
    } catch (e) { console.error(e); }
}

// ฟังก์ชัน Helper สำหรับแปลง BigInt (จาก Contract) เป็น string ทศนิยมที่มนุษย์อ่านได้
function formatBigDNT(amountBigInt) {
    let full = ethers.formatUnits(amountBigInt, 18);
    if (full.endsWith(".0")) full = full.slice(0, -2); // ลบ .0 ถ้ามี
    return full;
}

// ============================================================
// 3. USER ACTIONS (INDEX PAGE) - การกระทำของผู้ใช้ (หน้าหลัก)
// ============================================================

const buyBtn = document.getElementById("buyBtn");
if (buyBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มซื้อ DNT Token
    buyBtn.onclick = async () => {
        if (!contract) return alert("Connect Wallet First");
        const amount = document.getElementById("buyAmount").value; // จำนวน DNT ที่ต้องการซื้อ
        if (!amount || amount <= 0) return alert("ระบุจำนวนเงิน");

        try {
            const amountInt = parseInt(amount);
            // กำหนดราคา ETH ต่อ 1 DNT (เป็น Wei)
            const priceWei = ethers.parseEther("0.0000097");
            // คำนวณราคารวม ETH ที่ต้องจ่าย
            const cost = priceWei * BigInt(amountInt);

            // เรียกฟังก์ชัน buyTokens ของ Contract พร้อมส่ง ETH ไปด้วย ({ value: cost })
            const tx = await contract.buyTokens(amountInt, { value: cost });
            await tx.wait(); // รอจนกว่าธุรกรรมจะได้รับการยืนยัน
            alert("✅ ซื้อสำเร็จ!");
            updateBalance(); // อัปเดตยอด Balance
        } catch (e) { alert("Error: " + (e.reason || e.message)); }
    };
}

const donateBtn = document.getElementById("donateBtn");
if (donateBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มบริจาคให้มูลนิธิโดยตรง
    donateBtn.onclick = async () => {
        if (!contract) return alert("Connect Wallet First");
        const amount = document.getElementById("donateAmount").value; // จำนวน DNT ที่จะบริจาค
        const orgAddr = document.getElementById("donateOrg").value; // ที่อยู่มูลนิธิที่เลือก

        if (!amount || amount <= 0 || !orgAddr) return alert("ข้อมูลไม่ครบ");

        try {
            // เรียกฟังก์ชัน donate ของ Contract
            const tx = await contract.donate(orgAddr, parseInt(amount));
            await tx.wait();
            alert("✅ บริจาคสำเร็จ!");
            updateBalance();
        } catch (e) { alert("Error: " + (e.reason || e.message)); }
    };
}

const donateCampaignBtn = document.getElementById("donateCampaignBtn");
if (donateCampaignBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มบริจาคให้โครงการ
    donateCampaignBtn.onclick = async () => {
        if (!contract) return alert("Connect Wallet First");
        const campId = document.getElementById("campaignSelect").value; // ID โครงการที่เลือก
        const amount = document.getElementById("donateCampaignAmount").value; // จำนวน DNT ที่จะบริจาค

        if (!campId || !amount || amount <= 0) return alert("ข้อมูลไม่ครบ");

        try {
            // เรียกฟังก์ชัน donateToCampaign ของ Contract
            const tx = await contract.donateToCampaign(campId, parseInt(amount));
            await tx.wait();
            alert("✅ บริจาคสำเร็จ!");
            updateBalance();
            document.getElementById("donateCampaignAmount").value = "";
            loadDropdowns(); // โหลด Dropdown ใหม่เพื่ออัปเดตยอดบริจาค/สถานะโครงการ
        } catch (e) { alert("Error: " + (e.reason || e.message)); }
    };
}

// ============================================================
// 4. ADMIN ACTIONS (SUPER ADMIN) - การกระทำของผู้ดูแลระบบ (เจ้าของสัญญา)
// ============================================================

const newOrgAddressInput = document.getElementById('newOrgAddress'); // Input ที่อยู่มูลนิธิใหม่
const newOrgNameInput = document.getElementById('newOrgName'); // Input ชื่อมูลนิธิใหม่
const addOrgBtn = document.getElementById('addOrgBtn'); // ปุ่มเพิ่มมูลนิธิ
const addOrgMessage = document.getElementById('addOrgMessage'); // ข้อความสถานะการเพิ่มมูลนิธิ

// 🔥 FIX: เพิ่มการอ้างอิงถึง removeOrgAddressInput (ในโค้ดเดิมไม่ได้ประกาศไว้)
const removeOrgAddressInput = document.getElementById('removeOrgAddress'); // Input ที่อยู่มูลนิธิที่ต้องการลบ
const removeOrgBtn = document.getElementById('removeOrgBtn'); // ปุ่มลบมูลนิธิ
const withdrawExcessETHBtn = document.getElementById('withdrawExcessETHBtn'); // ปุ่มถอน ETH ส่วนเกิน
const adminStatusText = document.getElementById('adminStatus'); // ข้อความแสดงสถานะ Admin

// ฟังก์ชันตรวจสอบสถานะความเป็นเจ้าของสัญญา
function checkAdminStatus() {
    if (!adminStatusText) return;
    // เปรียบเทียบที่อยู่ Wallet ปัจจุบันกับที่อยู่ Owner ของ Contract (แปลงเป็นตัวเล็กทั้งหมดก่อนเปรียบเทียบ)
    if (contractOwnerAddress && currentAccount.toLowerCase() === contractOwnerAddress.toLowerCase()) {
        adminStatusText.innerText = "สถานะ: ✅ เจ้าของระบบ (Owner)";
        adminStatusText.style.color = "green";
        toggleAdminFunctions(true); // เปิดใช้งาน Input/ปุ่ม Admin
    } else {
        adminStatusText.innerText = "สถานะ: ❌ ไม่ใช่เจ้าของระบบ";
        adminStatusText.style.color = "red";
        toggleAdminFunctions(false); // ปิดใช้งาน Input/ปุ่ม Admin
    }
}

// ฟังก์ชันเปิด/ปิดการใช้งาน Input Fields และ Buttons สำหรับ Admin
function toggleAdminFunctions(enable) {
    // 🔥 FIX: เพิ่มการเปิด/ปิดการใช้งาน Input Fields
    if (newOrgAddressInput) newOrgAddressInput.disabled = !enable;
    if (newOrgNameInput) newOrgNameInput.disabled = !enable;
    if (removeOrgAddressInput) removeOrgAddressInput.disabled = !enable;

    // Buttons (เหมือนเดิม)
    if (addOrgBtn) addOrgBtn.disabled = !enable;
    if (removeOrgBtn) removeOrgBtn.disabled = !enable;
    if (withdrawExcessETHBtn) withdrawExcessETHBtn.disabled = !enable;
}

if (addOrgBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มเพิ่มมูลนิธิ
    addOrgBtn.onclick = async () => {
        if (!contract) return;
        const addr = newOrgAddressInput.value;
        const name = newOrgNameInput.value;
        if (!addr || !name) return alert("ข้อมูลไม่ครบ");

        try {
            addOrgMessage.innerText = "⏳ กำลังเพิ่ม...";
            // เรียกฟังก์ชัน addOrganization ของ Contract
            const tx = await contract.addOrganization(addr, name);
            await tx.wait();
            addOrgMessage.innerText = "✅ สำเร็จ!";
            loadDropdowns(); // โหลด Dropdown ใหม่เพื่อแสดงมูลนิธิที่เพิ่ม
        } catch (e) { addOrgMessage.innerText = "❌ Error"; console.error(e); }
    };
}

if (removeOrgBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มลบมูลนิธิ
    removeOrgBtn.onclick = async () => {
        if (!contract) return;
        // 🔥 FIX: ใช้ removeOrgAddressInput ที่ถูกประกาศใหม่
        const addr = removeOrgAddressInput ? removeOrgAddressInput.value : document.getElementById('removeOrgAddress').value;
        if (!addr) return alert("ระบุ Address");

        try {
            const msg = document.getElementById('removeOrgMessage');
            if (msg) msg.innerText = "⏳ กำลังลบ...";
            // เรียกฟังก์ชัน removeOrganization ของ Contract
            const tx = await contract.removeOrganization(addr);
            await tx.wait();
            if (msg) msg.innerText = "✅ สำเร็จ!";
            loadDropdowns(); // โหลด Dropdown ใหม่เพื่ออัปเดตรายการ
        } catch (e) { alert("Error: " + (e.reason || e.message)); }
    };
}

if (withdrawExcessETHBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มถอน ETH ส่วนเกิน (ETH ที่เหลือจากการขาย DNT)
    withdrawExcessETHBtn.onclick = async () => {
        if (!contract) return;
        try {
            // เรียกฟังก์ชัน withdrawExcessETH ของ Contract (เรียกได้เฉพาะ Owner)
            const tx = await contract.withdrawExcessETH();
            await tx.wait();
            alert("ถอนสำเร็จ");
        } catch (e) { alert("Error"); }
    };
}

// ============================================================
// 5. ORGANIZATION ADMIN (AdminOrg.html) - ผู้ดูแลระบบองค์กร
// ============================================================

const orgStatusText = document.getElementById('orgStatus'); // ข้อความแสดงสถานะองค์กร
const orgFunctionsDiv = document.getElementById('orgFunctions'); // Div สำหรับฟังก์ชันองค์กร
const orgBalanceDisplay = document.getElementById('orgBalance'); // ข้อความแสดงยอด DNT ขององค์กร
const createCampaignBtn = document.getElementById('createCampaignBtn'); // ปุ่มสร้างโครงการ
const campaignMessage = document.getElementById('campaignMessage'); // ข้อความสถานะการสร้างโครงการ
const campaignListDiv = document.getElementById('campaignList'); // Div สำหรับแสดงรายการโครงการ
const withdrawOrgFundsBtn = document.getElementById('withdrawOrgFundsBtn'); // ปุ่มถอนเงินองค์กร (DNT)
const withdrawMessageOrg = document.getElementById('withdrawMessage'); // ข้อความสถานะการถอนเงินองค์กร

// ฟังก์ชันตรวจสอบและแสดงสถานะความเป็นองค์กรที่ได้รับการอนุมัติ
async function checkAndDisplayOrgStatus() {
    if (!orgStatusText) return;
    try {
        // ดึงข้อมูลองค์กรจาก Contract โดยใช้ Wallet Address ปัจจุบัน
        const orgInfo = await contract.organizations(currentAccount);
        if (orgInfo.isApproved) { // ถ้าได้รับการอนุมัติแล้ว
            orgStatusText.textContent = `✅ ${orgInfo.name}`;
            orgStatusText.style.color = '#27ae60';
            if (orgFunctionsDiv) orgFunctionsDiv.style.display = 'block'; // แสดงส่วนฟังก์ชัน
            displayOrgBalance(); // แสดงยอด DNT คงเหลือ
            displayOrgCampaigns(); // แสดงรายการโครงการที่สร้าง
        } else {
            orgStatusText.textContent = "❌ ไม่ใช่องค์กร";
            orgStatusText.style.color = 'red';
            if (orgFunctionsDiv) orgFunctionsDiv.style.display = 'none'; // ซ่อนส่วนฟังก์ชัน
        }
    } catch (e) { console.error(e); }
}

// ฟังก์ชันแสดงยอด DNT Token ขององค์กร
async function displayOrgBalance() {
    if (!orgBalanceDisplay) return;
    const orgInfo = await contract.organizations(currentAccount);
    // ใช้ Helper function แปลง BigInt เป็น string ทศนิยม
    orgBalanceDisplay.textContent = `${formatBigDNT(orgInfo.balance)} DNT`;
}

if (createCampaignBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มสร้างโครงการ
    createCampaignBtn.onclick = async () => {
        if (!contract) return;
        const title = document.getElementById('campaignTitle').value; // ชื่อโครงการ
        const target = document.getElementById('campaignTarget').value; // เป้าหมาย (DNT)
        const days = document.getElementById('campaignDuration').value; // ระยะเวลา (วัน)

        if (!title || !target || !days) return alert("ข้อมูลไม่ครบ");

        try {
            campaignMessage.innerText = "⏳ กำลังสร้าง...";
            // เรียกฟังก์ชัน createCampaign ของ Contract
            const tx = await contract.createCampaign(title, parseInt(target), parseInt(days));
            await tx.wait();
            campaignMessage.innerText = "✅ สำเร็จ!";
            displayOrgCampaigns(); // แสดงรายการโครงการใหม่
        } catch (e) {
            campaignMessage.innerText = "❌ Error";
            console.error(e);
        }
    };
}

// ฟังก์ชันแสดงรายการโครงการที่องค์กรนี้สร้าง
async function displayOrgCampaigns() {
    if (!campaignListDiv || !contract) return;
    campaignListDiv.innerHTML = '<p>กำลังโหลด...</p>';
    const allCamps = await contract.getAllCampaigns(); // ดึงโครงการทั้งหมด

    // กรองเฉพาะโครงการที่สร้างโดย Wallet Address ปัจจุบัน
    const myCamps = allCamps.filter(c =>
        c.orgAddress.toLowerCase() === currentAccount.toLowerCase() && Number(c.id) !== 0
    );

    if (myCamps.length === 0) {
        campaignListDiv.innerHTML = '<p>ไม่มีแคมเปญ</p>';
        return;
    }

    let html = '';
    // วนลูปแสดงรายละเอียดโครงการ
    [...myCamps].reverse().forEach(c => {
        const id = Number(c.id);
        const target = ethers.formatUnits(c.targetAmount, 18);
        const raised = ethers.formatUnits(c.raisedAmount, 18);
        const isGoalReached = parseFloat(raised) >= parseFloat(target); // เป้าหมายถึงแล้ว
        // แปลง deadline เป็นมิลลิวินาทีแล้วเปรียบเทียบกับเวลาปัจจุบัน
        const isExpired = Date.now() > Number(c.deadline) * 1000; // หมดเขตแล้ว

        let status = '<span style="color:blue">กำลังดำเนินการ</span>';
        let action = '';

        if (c.isEnded) { // ถ้าโครงการถูกปิดไปแล้ว (ถอนเงินเสร็จแล้ว)
            status = '<span style="color:gray">ปิดแล้ว</span>';
        } else if (isGoalReached || isExpired) { // ถ้าเป้าหมายถึง หรือ หมดเขต
            status = '<span style="color:green">พร้อมถอนเงิน</span>';
            // สร้างปุ่ม 'ถอนเงิน' และเรียกใช้ฟังก์ชัน withdrawCampaign ผ่าน window (ทำให้เข้าถึงได้จาก HTML)
            action = `<button onclick="window.withdrawCampaign(${id})" style="background:green; color:white; border:none; padding:5px; cursor:pointer;">ถอนเงิน</button>`;
        }

        // สร้าง HTML สำหรับแสดงรายละเอียดแต่ละโครงการ
        html += `
            <div style="border:1px solid #ffffffff; padding:10px; margin-bottom:10px; border-radius:5px; background:black;">
                <div style="display:flex; justify-content:space-between;">
                    <strong>ID ${id}: ${c.title}</strong>
                    ${status}
                </div>
                <div style="font-size:0.9em; color:white;">
                    เป้าหมาย : ${parseFloat(target).toLocaleString()} DNT | ได้: ${parseFloat(raised).toLocaleString()} DNT
                </div>
                <div style="text-align:right; margin-top:5px;">${action}</div>
            </div>
        `;
    });
    campaignListDiv.innerHTML = html;
}

if (withdrawOrgFundsBtn) {
    // กำหนดฟังก์ชันเมื่อคลิกปุ่มถอนเงิน DNT ขององค์กร (ยอดรวมที่ไม่ใช่โครงการ)
    withdrawOrgFundsBtn.onclick = async () => {
        if (!contract) return;
        try {
            if (withdrawMessageOrg) withdrawMessageOrg.innerText = "⏳ กำลังถอน...";
            // เรียกฟังก์ชัน withdrawFunds ของ Contract (ถอนยอด DNT ขององค์กร)
            const tx = await contract.withdrawFunds();
            await tx.wait();
            if (withdrawMessageOrg) withdrawMessageOrg.innerText = "✅ สำเร็จ!";
            displayOrgBalance(); // อัปเดตยอดคงเหลือ
        } catch (e) { alert("Error: " + e.message); }
    };
}

// Global Withdraw Function - ฟังก์ชันถอนเงินโครงการ (ถูกเรียกจากปุ่มใน displayOrgCampaigns)
window.withdrawCampaign = async (id) => {
    if (!contract) return alert("Connect Wallet");
    if (confirm(`ยืนยันถอนเงินแคมเปญ ID: ${id}?`)) { // ยืนยันก่อนถอน
        try {
            // เรียกฟังก์ชัน withdrawCampaignFunds ของ Contract
            const tx = await contract.withdrawCampaignFunds(id);
            await tx.wait();
            alert("✅ ถอนเงินสำเร็จ!");
            displayOrgCampaigns(); // อัปเดตรายการโครงการ
        } catch (e) {
            alert("Error: " + (e.reason || e.message));
        }
    }
};