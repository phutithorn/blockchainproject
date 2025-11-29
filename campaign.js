import { CONTRACT_ADDRESS, ABI } from "./abi.js";

const CAMPAIGN_CARD_GRID = document.getElementById("campaignCardGrid");

/**
 * ฟังก์ชันสร้าง HTML สำหรับ Card
 */
function createCampaignCard(camp) {
    // 1. แปลงข้อมูล
    const id = camp.id;
    const title = camp.title;
    const orgShort = camp.orgAddress.substring(0, 6) + "..." + camp.orgAddress.substring(38);
    
    const target = parseFloat(ethers.formatUnits(camp.targetAmount, 18));
    const raised = parseFloat(ethers.formatUnits(camp.raisedAmount, 18));
    
    const percent = target > 0 ? Math.min((raised / target) * 100, 100) : 0;
    
    const deadlineMs = Number(camp.deadline) * 1000;
    const nowMs = Date.now();
    const daysLeft = Math.ceil((deadlineMs - nowMs) / (1000 * 60 * 60 * 24));
    
    const isClosed = daysLeft <= 0 || camp.isEnded;
    const btnText = isClosed ? "ปิดรับบริจาค" : "บริจาคเลย";
    const btnClass = isClosed ? "donate-btn disabled" : "donate-btn";
    
    // [แก้ไข] เปลี่ยนคำสั่ง onclick เป็น redirectToDonate แทน
    const btnState = isClosed ? "disabled" : `onclick="window.redirectToDonate(${id})"`;

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
 */
async function loadAllCampaigns() {
    if (!CAMPAIGN_CARD_GRID) return;
    
    CAMPAIGN_CARD_GRID.innerHTML = '<p id="loadingMessage">⏳ กำลังโหลดข้อมูลจาก Blockchain...</p>';
    
    try {
        let provider;
        if (window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
        } else {
            CAMPAIGN_CARD_GRID.innerHTML = '<p style="text-align:center; margin-top:50px;">ไม่พบ MetaMask กรุณาติดตั้งเพื่อใช้งาน</p>';
            return;
        }

        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const campaigns = await contract.getAllCampaigns();
        const activeCampaigns = campaigns.filter(c => c.id != 0);

        if (activeCampaigns.length === 0) {
            CAMPAIGN_CARD_GRID.innerHTML = '<p style="text-align:center; width:100%; grid-column: 1/-1; margin-top:50px;">ขณะนี้ยังไม่มีโครงการระดมทุน</p>';
            return;
        }

        let htmlContent = '';
        [...activeCampaigns].reverse().forEach(camp => {
            htmlContent += createCampaignCard(camp);
        });

        CAMPAIGN_CARD_GRID.innerHTML = htmlContent;
        
    } catch (error) {
        console.error("Error loading campaigns:", error);
        CAMPAIGN_CARD_GRID.innerHTML = `<p style="color:red; text-align:center;">❌ โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
    }
}

// ----------------------------------------------------------------------
// [ใหม่] ฟังก์ชันย้ายหน้าไป Index พร้อมส่ง ID
// ----------------------------------------------------------------------
window.redirectToDonate = (id) => {
    // ส่งค่า campaignId ผ่าน URL ไปที่หน้า index.html
    window.location.href = `index.html?campaignId=${id}`;
};

// เริ่มทำงาน
window.addEventListener('DOMContentLoaded', loadAllCampaigns);