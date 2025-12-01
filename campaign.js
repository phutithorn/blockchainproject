import { CONTRACT_ADDRESS, ABI } from "./abi.js";

const CAMPAIGN_CARD_GRID = document.getElementById("campaignCardGrid");

/**
 * ฟังก์ชันสร้าง HTML สำหรับ Card
 */
function createCampaignCard(camp) {
    // 1. แปลงข้อมูล
    const id = camp.id;
    const title = camp.title;
    // ตัดตอนที่อยู่ขององค์กรให้เหลือเฉพาะตัวอักษรส่วนต้นกับส่วนท้ายเพื่อความสั้น
    const orgShort = camp.orgAddress.substring(0, 6) + "..." + camp.orgAddress.substring(38);

    // แปลงจำนวน Wei (BigInt) เป็นหน่วย DNT (จำนวนทศนิยม 18 ตำแหน่ง) แล้วแปลงเป็นตัวเลข (float)
    const target = parseFloat(ethers.formatUnits(camp.targetAmount, 18));
    const raised = parseFloat(ethers.formatUnits(camp.raisedAmount, 18));

    // คำนวณเปอร์เซ็นต์ความคืบหน้า (ถ้า target > 0) และจำกัดไม่ให้เกิน 100%
    const percent = target > 0 ? Math.min((raised / target) * 100, 100) : 0;

    // แปลงเวลาที่กำหนด (timestamp เป็นวินาที) เป็นมิลลิวินาทีสำหรับการคำนวณเวลา
    const deadlineMs = Number(camp.deadline) * 1000;
    const nowMs = Date.now();
    // คำนวณจำนวนวันที่เหลือ หาก deadline ผ่านไปแล้ว daysLeft จะเป็นค่าติดลบหรือ 0
    const daysLeft = Math.ceil((deadlineMs - nowMs) / (1000 * 60 * 60 * 24));

    // ตรวจสอบว่าโครงการปิดรับบริจาคหรือยัง (วันหมดอายุ <= 0 หรือ flag isEnded เป็นจริง)
    const isClosed = daysLeft <= 0 || camp.isEnded;
    // กำหนดข้อความปุ่มและคลาสปุ่มตามสถานะ (ปิด/เปิด)
    const btnText = isClosed ? "ปิดรับบริจาค" : "บริจาคเลย";
    const btnClass = isClosed ? "donate-btn disabled" : "donate-btn";

    // [แก้ไข] เปลี่ยนคำสั่ง onclick เป็น redirectToDonate แทน
    // ถ้าโครงการปิด จะไม่ใส่ onclick (หรือใส่สถานะ disabled)
    const btnState = isClosed ? "disabled" : `onclick="window.redirectToDonate(${id})"`;

    // คืนค่า HTML ของ card เป็น string (ยังไม่ได้ต่อ DOM ตรงนี้)
    return `
        <div class="campaign-card">
            <div class="card-header">❤️</div>
            <div class="card-body">
                <h3 class="camp-title">${title}</h3>
                <div class="camp-org">
                    <span>👤 โดย: ${orgShort}</span>
                </div>

                <div class="progress-container">
                    <div class="progress-labels">
                        <span style="color:#00b894;">ได้แล้ว ${raised.toLocaleString()} DNT</span>
                        <span style="color:#636e72;">${percent.toFixed(0)}%</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                    </div>
                </div>

                <div class="stat-grid">
                    <div class="stat-item">
                        <strong>${target.toLocaleString()}</strong>
                        เป้าหมาย (DNT)
                    </div>
                    <div class="stat-item" style="text-align:right;">
                        <strong>${daysLeft > 0 ? daysLeft + " วัน" : "จบแล้ว"}</strong>
                        เวลาที่เหลือ
                    </div>
                </div>
            </div>
            <button class="${btnClass}" ${btnState}>
                ${btnText}
            </button>
        </div>
    `;
}

/**
 * ฟังก์ชันโหลดข้อมูล (Auto Load)
 * - อ่าน element เปล่าสำหรับแสดง card
 * - ติดต่อโปรไวเดอร์ (เช่น MetaMask ผ่าน window.ethereum)
 * - โหลดข้อมูลแคมเปญจากสัญญา (contract.getAllCampaigns())
 * - กรองแคมเปญที่ id != 0 (ถือเป็นรายการที่มีอยู่จริง)
 * - สร้าง HTML ของแต่ละแคมเปญแล้วแปะเข้าไปใน DOM
 */
async function loadAllCampaigns() {
    if (!CAMPAIGN_CARD_GRID) return; // ถ้า element ไม่เจอ ให้หยุด

    // แสดงข้อความ loading ระหว่างรอข้อมูล
    CAMPAIGN_CARD_GRID.innerHTML = '<p id="loadingMessage">⏳ กำลังโหลดข้อมูลจาก Blockchain...</p>';

    try {
        let provider;
        // ตรวจสอบว่าผู้ใช้มี MetaMask (window.ethereum) หรือไม่
        if (window.ethereum) {
            // สร้าง BrowserProvider ของ ethers (เชื่อมกับ MetaMask)
            provider = new ethers.BrowserProvider(window.ethereum);
        } else {
            // ถ้าไม่มี MetaMask ให้แจ้งผู้ใช้และหยุดการทำงาน
            CAMPAIGN_CARD_GRID.innerHTML = '<p style="text-align:center; margin-top:50px;">ไม่พบ MetaMask กรุณาติดตั้งเพื่อใช้งาน</p>';
            return;
        }

        // สร้าง contract instance โดยใช้ provider (อ่านข้อมูลได้อย่างเดียว)
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        // เรียกฟังก์ชัน getAllCampaigns() จากสัญญาเพื่อดึงข้อมูลทั้งหมด
        const campaigns = await contract.getAllCampaigns();
        // กรองรายการที่มี id != 0 (เพื่อเอาเฉพาะรายการจริงที่ถูกเก็บไว้)
        const activeCampaigns = campaigns.filter(c => c.id != 0);

        // ถ้าไม่มีแคมเปญให้แสดงข้อความแจ้ง
        if (activeCampaigns.length === 0) {
            CAMPAIGN_CARD_GRID.innerHTML = '<p style="text-align:center; width:100%; grid-column: 1/-1; margin-top:50px;">ขณะนี้ยังไม่มีโครงการระดมทุน</p>';
            return;
        }

        // สร้าง HTML ของทุกแคมเปญ (reverse เพื่อให้รายการล่าสุดแสดงก่อน)
        let htmlContent = '';
        [...activeCampaigns].reverse().forEach(camp => {
            htmlContent += createCampaignCard(camp);
        });

        // นำ HTML ที่สร้างเสร็จแล้วใส่เข้าไปใน DOM (แทนข้อความ loading)
        CAMPAIGN_CARD_GRID.innerHTML = htmlContent;

    } catch (error) {
        // ถ้ามีข้อผิดพลาดขณะโหลด ให้ log ลง console และแสดงข้อความที่ผู้ใช้เข้าใจได้
        console.error("Error loading campaigns:", error);
        CAMPAIGN_CARD_GRID.innerHTML = `<p style="color:red; text-align:center;">❌ โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
    }
}

// ----------------------------------------------------------------------
// [ใหม่] ฟังก์ชันย้ายหน้าไป Index พร้อมส่ง ID
// ----------------------------------------------------------------------
window.redirectToDonate = (id) => {
    // ส่งค่า campaignId ผ่าน URL ไปที่หน้า index.html
    // ตัวอย่าง: index.html?campaignId=3
    window.location.href = `index.html?campaignId=${id}`;
};

// เริ่มทำงานเมื่อ DOM โหลดเสร็จ (auto-run)
window.addEventListener('DOMContentLoaded', loadAllCampaigns);
