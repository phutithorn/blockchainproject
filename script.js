import { CONTRACT_ADDRESS, ABI } from "./abi.js";

let provider;
let signer;
let contract;
let currentAccount = null;
let contractOwnerAddress = null;

// ============================================================
// 1. SYSTEM & INITIALIZATION (AUTO LOAD)
// ============================================================

// โหลดข้อมูล Dropdown ทันทีเมื่อเปิดเว็บ
async function loadDropdowns() {
    console.log("Loading Dropdowns...");

    // สร้าง Contract ชั่วคราว (Read-only)
    let tempContract = contract;
    if (!tempContract) {
        if (window.ethereum) {
            try {
                const p = new ethers.BrowserProvider(window.ethereum);
                tempContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, p);
            } catch (e) {
                console.error("Provider Error:", e);
                return;
            }
        } else {
            updateDropdownStatus("กรุณาติดตั้ง MetaMask");
            return;
        }
    }

    function updateDropdownStatus(msg) {
        const cSelect = document.getElementById("campaignSelect");
        const oSelect = document.getElementById("donateOrg");
        if (cSelect) cSelect.innerHTML = `<option disabled selected>${msg}</option>`;
        if (oSelect) oSelect.innerHTML = `<option disabled selected>${msg}</option>`;
    }

    try {
        // --- 1. Campaign Dropdown ---
        const cSelect = document.getElementById("campaignSelect");
        if (cSelect) {
            const allCamps = await tempContract.getAllCampaigns();
            const active = allCamps.filter(c => {
                const id = Number(c.id);
                const deadline = Number(c.deadline) * 1000;
                return id !== 0 && !c.isEnded && Date.now() < deadline;
            });

            cSelect.innerHTML = '<option value="" disabled selected>-- เลือกโครงการ --</option>';
            if (active.length === 0) {
                cSelect.innerHTML = '<option disabled>ไม่มีโครงการที่เปิดรับ</option>';
            } else {
                [...active].reverse().forEach(c => {
                    const opt = document.createElement("option");
                    opt.value = c.id;
                    opt.text = `ID ${c.id}: ${c.title}`;
                    cSelect.appendChild(opt);
                });
            }
        }

        // --- 2. Org Dropdown ---
        const oSelect = document.getElementById("donateOrg");
        if (oSelect) {
            const orgs = await tempContract.getAllOrganizations();
            oSelect.innerHTML = '<option value="" disabled selected>-- เลือกมูลนิธิ --</option>';

            let hasOrg = false;
            orgs.forEach(o => {
                if (o.isApproved) {
                    const opt = document.createElement("option");
                    opt.value = o.walletAddr;
                    opt.text = o.name;
                    oSelect.appendChild(opt);
                    hasOrg = true;
                }
            });
            if (!hasOrg) oSelect.innerHTML = '<option disabled>ไม่มีมูลนิธิ</option>';

            // เช็ค URL
            checkUrlParam();
        }

    } catch (e) {
        console.error("Load Error:", e);
        updateDropdownStatus("โหลดไม่ได้ (เช็ค Network)");
    }
}

function checkUrlParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetAddress = urlParams.get('donateOrg');
    const campaignId = urlParams.get('campaignId');

    const orgDropdown = document.getElementById("donateOrg");
    const campDropdown = document.getElementById("campaignSelect");
    const lockedDisplay = document.getElementById("lockedOrgName");

    // เลือก Org
    if (targetAddress && orgDropdown && lockedDisplay) {
        orgDropdown.value = targetAddress;
        if (orgDropdown.selectedIndex > -1) {
            orgDropdown.style.display = 'none';
            lockedDisplay.style.display = 'block';
            lockedDisplay.innerText = orgDropdown.options[orgDropdown.selectedIndex].text;
        }
    }

    // เลือก Campaign
    if (campaignId && campDropdown) {
        campDropdown.value = campaignId;
        const section = campDropdown.closest('.control-group');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            section.style.border = "2px solid #e67e22";
            setTimeout(() => section.style.border = "none", 2000);
        }
    }
}

// เรียกทันที
window.addEventListener('DOMContentLoaded', () => {
    loadDropdowns();
});


// ============================================================
// 2. CONNECT WALLET
// ============================================================

const connectBtn = document.getElementById('connectBtn');
if (connectBtn) {
    connectBtn.onclick = async () => {
        if (window.ethereum) {
            try {
                provider = new ethers.BrowserProvider(window.ethereum);
                await provider.send("eth_requestAccounts", []);
                signer = await provider.getSigner();
                contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
                currentAccount = await signer.getAddress();

                await updateBalance();
                await loadDropdowns();

                // Check Pages
                if (document.getElementById('adminStatus')) {
                    const tempProvider = new ethers.BrowserProvider(window.ethereum);
                    const readOnlyContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, tempProvider);
                    contractOwnerAddress = await readOnlyContract.owner();
                    checkAdminStatus();
                } else if (document.getElementById('orgStatus')) {
                    checkAndDisplayOrgStatus();
                }

            } catch (err) {
                alert("Connection Error: " + err.message);
            }
        } else {
            alert("Please install MetaMask");
        }
    };
}

async function updateBalance() {
    const walletText = document.getElementById('walletAddress');
    if (!contract || !walletText) return;
    try {
        const bal = await contract.balanceOf(currentAccount);
        const humanBal = ethers.formatUnits(bal, 18);
        walletText.innerText = `Wallet: ${currentAccount.substring(0, 6)}... | Balance: ${parseFloat(humanBal).toFixed(2)} DNT`;
    } catch (e) { console.error(e); }
}

// Helper
function formatBigDNT(amountBigInt) {
    let full = ethers.formatUnits(amountBigInt, 18);
    if (full.endsWith(".0")) full = full.slice(0, -2);
    return full;
}

// ============================================================
// 3. USER ACTIONS (INDEX PAGE)
// ============================================================

const buyBtn = document.getElementById("buyBtn");
if (buyBtn) {
    buyBtn.onclick = async () => {
        if (!contract) return alert("Connect Wallet First");
        const amount = document.getElementById("buyAmount").value;
        if (!amount || amount <= 0) return alert("ระบุจำนวนเงิน");

        try {
            const amountInt = parseInt(amount);
            const priceWei = ethers.parseEther("0.0000097");
            const cost = priceWei * BigInt(amountInt);

            const tx = await contract.buyTokens(amountInt, { value: cost });
            await tx.wait();
            alert("✅ ซื้อสำเร็จ!");
            updateBalance();
        } catch (e) { alert("Error: " + (e.reason || e.message)); }
    };
}

const donateBtn = document.getElementById("donateBtn");
if (donateBtn) {
    donateBtn.onclick = async () => {
        if (!contract) return alert("Connect Wallet First");
        const amount = document.getElementById("donateAmount").value;
        const orgAddr = document.getElementById("donateOrg").value;

        if (!amount || amount <= 0 || !orgAddr) return alert("ข้อมูลไม่ครบ");

        try {
            const tx = await contract.donate(orgAddr, parseInt(amount));
            await tx.wait();
            alert("✅ บริจาคสำเร็จ!");
            updateBalance();
        } catch (e) { alert("Error: " + (e.reason || e.message)); }
    };
}

const donateCampaignBtn = document.getElementById("donateCampaignBtn");
if (donateCampaignBtn) {
    donateCampaignBtn.onclick = async () => {
        if (!contract) return alert("Connect Wallet First");
        const campId = document.getElementById("campaignSelect").value;
        const amount = document.getElementById("donateCampaignAmount").value;

        if (!campId || !amount || amount <= 0) return alert("ข้อมูลไม่ครบ");

        try {
            const tx = await contract.donateToCampaign(campId, parseInt(amount));
            await tx.wait();
            alert("✅ บริจาคสำเร็จ!");
            updateBalance();
            document.getElementById("donateCampaignAmount").value = "";
            loadDropdowns();
        } catch (e) { alert("Error: " + (e.reason || e.message)); }
    };
}

// ============================================================
// 4. ADMIN ACTIONS (SUPER ADMIN)
// ============================================================

const newOrgAddressInput = document.getElementById('newOrgAddress');
const newOrgNameInput = document.getElementById('newOrgName');
const addOrgBtn = document.getElementById('addOrgBtn');
const addOrgMessage = document.getElementById('addOrgMessage');

// 🔥 FIX: เพิ่มการอ้างอิงถึง removeOrgAddressInput (ในโค้ดเดิมไม่ได้ประกาศไว้)
const removeOrgAddressInput = document.getElementById('removeOrgAddress');
const removeOrgBtn = document.getElementById('removeOrgBtn');
const withdrawExcessETHBtn = document.getElementById('withdrawExcessETHBtn');
const adminStatusText = document.getElementById('adminStatus');

function checkAdminStatus() {
    if (!adminStatusText) return;
    if (contractOwnerAddress && currentAccount.toLowerCase() === contractOwnerAddress.toLowerCase()) {
        adminStatusText.innerText = "สถานะ: ✅ เจ้าของระบบ (Owner)";
        adminStatusText.style.color = "green";
        toggleAdminFunctions(true); // <--- ถูกเรียกให้เปิด Input/ปุ่ม
    } else {
        adminStatusText.innerText = "สถานะ: ❌ ไม่ใช่เจ้าของระบบ";
        adminStatusText.style.color = "red";
        toggleAdminFunctions(false);
    }
}

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
    addOrgBtn.onclick = async () => {
        if (!contract) return;
        const addr = newOrgAddressInput.value;
        const name = newOrgNameInput.value;
        if (!addr || !name) return alert("ข้อมูลไม่ครบ");

        try {
            addOrgMessage.innerText = "⏳ กำลังเพิ่ม...";
            const tx = await contract.addOrganization(addr, name);
            await tx.wait();
            addOrgMessage.innerText = "✅ สำเร็จ!";
            loadDropdowns();
        } catch (e) { addOrgMessage.innerText = "❌ Error"; console.error(e); }
    };
}

if (removeOrgBtn) {
    removeOrgBtn.onclick = async () => {
        if (!contract) return;
        // 🔥 FIX: ใช้ removeOrgAddressInput ที่ถูกประกาศใหม่
        const addr = removeOrgAddressInput ? removeOrgAddressInput.value : document.getElementById('removeOrgAddress').value;
        if (!addr) return alert("ระบุ Address");

        try {
            const msg = document.getElementById('removeOrgMessage');
            if (msg) msg.innerText = "⏳ กำลังลบ...";
            const tx = await contract.removeOrganization(addr);
            await tx.wait();
            if (msg) msg.innerText = "✅ สำเร็จ!";
            loadDropdowns();
        } catch (e) { alert("Error: " + (e.reason || e.message)); }
    };
}

if (withdrawExcessETHBtn) {
    withdrawExcessETHBtn.onclick = async () => {
        if (!contract) return;
        try {
            const tx = await contract.withdrawExcessETH();
            await tx.wait();
            alert("ถอนสำเร็จ");
        } catch (e) { alert("Error"); }
    };
}

// ============================================================
// 5. ORGANIZATION ADMIN (AdminOrg.html)
// ============================================================

const orgStatusText = document.getElementById('orgStatus');
const orgFunctionsDiv = document.getElementById('orgFunctions');
const orgBalanceDisplay = document.getElementById('orgBalance');
const createCampaignBtn = document.getElementById('createCampaignBtn');
const campaignMessage = document.getElementById('campaignMessage');
const campaignListDiv = document.getElementById('campaignList');
const withdrawOrgFundsBtn = document.getElementById('withdrawOrgFundsBtn');
const withdrawMessageOrg = document.getElementById('withdrawMessage');

async function checkAndDisplayOrgStatus() {
    if (!orgStatusText) return;
    try {
        const orgInfo = await contract.organizations(currentAccount);
        if (orgInfo.isApproved) {
            orgStatusText.textContent = `✅ ${orgInfo.name}`;
            orgStatusText.style.color = '#27ae60';
            if (orgFunctionsDiv) orgFunctionsDiv.style.display = 'block';
            displayOrgBalance();
            displayOrgCampaigns();
        } else {
            orgStatusText.textContent = "❌ ไม่ใช่องค์กร";
            orgStatusText.style.color = 'red';
            if (orgFunctionsDiv) orgFunctionsDiv.style.display = 'none';
        }
    } catch (e) { console.error(e); }
}

async function displayOrgBalance() {
    if (!orgBalanceDisplay) return;
    const orgInfo = await contract.organizations(currentAccount);
    orgBalanceDisplay.textContent = `${formatBigDNT(orgInfo.balance)} DNT`;
}

if (createCampaignBtn) {
    createCampaignBtn.onclick = async () => {
        if (!contract) return;
        const title = document.getElementById('campaignTitle').value;
        const target = document.getElementById('campaignTarget').value;
        const days = document.getElementById('campaignDuration').value;

        if (!title || !target || !days) return alert("ข้อมูลไม่ครบ");

        try {
            campaignMessage.innerText = "⏳ กำลังสร้าง...";
            const tx = await contract.createCampaign(title, parseInt(target), parseInt(days));
            await tx.wait();
            campaignMessage.innerText = "✅ สำเร็จ!";
            displayOrgCampaigns();
        } catch (e) {
            campaignMessage.innerText = "❌ Error";
            console.error(e);
        }
    };
}

async function displayOrgCampaigns() {
    if (!campaignListDiv || !contract) return;
    campaignListDiv.innerHTML = '<p>กำลังโหลด...</p>';
    const allCamps = await contract.getAllCampaigns();

    const myCamps = allCamps.filter(c =>
        c.orgAddress.toLowerCase() === currentAccount.toLowerCase() && Number(c.id) !== 0
    );

    if (myCamps.length === 0) {
        campaignListDiv.innerHTML = '<p>ไม่มีแคมเปญ</p>';
        return;
    }

    let html = '';
    [...myCamps].reverse().forEach(c => {
        const id = Number(c.id);
        const target = ethers.formatUnits(c.targetAmount, 18);
        const raised = ethers.formatUnits(c.raisedAmount, 18);
        const isGoalReached = parseFloat(raised) >= parseFloat(target);
        const isExpired = Date.now() > Number(c.deadline) * 1000;

        let status = '<span style="color:blue">กำลังดำเนินการ</span>';
        let action = '';

        if (c.isEnded) {
            status = '<span style="color:gray">ปิดแล้ว</span>';
        } else if (isGoalReached || isExpired) {
            status = '<span style="color:green">พร้อมถอนเงิน</span>';
            action = `<button onclick="window.withdrawCampaign(${id})" style="background:green; color:white; border:none; padding:5px; cursor:pointer;">ถอนเงิน</button>`;
        }

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
    withdrawOrgFundsBtn.onclick = async () => {
        if (!contract) return;
        try {
            if (withdrawMessageOrg) withdrawMessageOrg.innerText = "⏳ กำลังถอน...";
            const tx = await contract.withdrawFunds();
            await tx.wait();
            if (withdrawMessageOrg) withdrawMessageOrg.innerText = "✅ สำเร็จ!";
            displayOrgBalance();
        } catch (e) { alert("Error: " + e.message); }
    };
}

// Global Withdraw Function
window.withdrawCampaign = async (id) => {
    if (!contract) return alert("Connect Wallet");
    if (confirm(`ยืนยันถอนเงินแคมเปญ ID: ${id}?`)) {
        try {
            const tx = await contract.withdrawCampaignFunds(id);
            await tx.wait();
            alert("✅ ถอนเงินสำเร็จ!");
            displayOrgCampaigns();
        } catch (e) {
            alert("Error: " + (e.reason || e.message));
        }
    }
};