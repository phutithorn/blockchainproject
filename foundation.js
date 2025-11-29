// foundation.js
import { CONTRACT_ADDRESS, ABI } from "./abi.js";

const FOUNDATION_CARD_GRID = document.getElementById("foundationCardGrid");

/**
 * ฟังก์ชันสร้าง HTML สำหรับ Card มูลนิธิ
 * @param {string} orgName - ชื่อมูลนิธิ
 * @param {string} orgAddress - Wallet Address ของมูลนิธิ
 * @returns {string} โค้ด HTML สำหรับ Card
 */
function createFoundationCard(orgName, orgAddress) {
    // กำหนดค่าเริ่มต้นให้เป็น E-DONATION ตลอด
    let tagClass = 'e-donation';
    let tagName = 'E-DONATION'; 
    
    // ***** ส่วนที่แก้ไข: เปลี่ยน href ให้ส่ง Address ผ่าน URL Query Parameter *****
    return `
        <div class="foundation-card">
            <div class="foundation-info">
                <h3>${orgName}</h3>
                <p class="tag ${tagClass}">${tagName}</p>
            </div>
            <a href="index.html?donateOrg=${orgAddress}" class="btn-donate">บริจาคเลย</a>
        </div>
    `;
}

/**
 * ฟังก์ชันหลักในการโหลดข้อมูลมูลนิธิจาก Smart Contract
 */
async function loadAllFoundations() {
    if (!FOUNDATION_CARD_GRID) return;

    // ตรวจสอบว่า Ethers.js ถูกโหลดแล้วหรือไม่
    if (!window.ethers) {
        FOUNDATION_CARD_GRID.innerHTML = '<p style="color:red;">❌ Ethers.js ไม่ถูกโหลด กรุณาตรวจสอบแท็ก script ใน HTML</p>';
        return;
    }
    
    FOUNDATION_CARD_GRID.innerHTML = '<p id="loadingMessage">⏳ กำลังเชื่อมต่อและโหลดข้อมูลมูลนิธิ...</p>';
    
    try {
        let provider;
        
        // ใช้ BrowserProvider หากมี MetaMask หรือ Wallet อื่นติดตั้งอยู่
        if (window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
        } else {
            // หากไม่พบ Wallet, ควรใช้ JsonRpcProvider สำหรับโหมดอ่าน (Read-only)
            // ***หมายเหตุ: คุณต้องแทนที่ "YOUR_NETWORK_RPC_URL" ด้วย RPC URL ของเครือข่ายที่คุณใช้งานจริง***
            FOUNDATION_CARD_GRID.innerHTML = '<p style="color:orange;">⚠️ ไม่พบ Wallet (MetaMask) กำลังพยายามใช้ Public RPC Provider...</p>';
            provider = new ethers.JsonRpcProvider("YOUR_NETWORK_RPC_URL");
        }

        // สร้าง Contract instance ในโหมดอ่าน
        const readOnlyContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        
        // เรียกฟังก์ชันจาก Contract เพื่อดึงรายการมูลนิธิทั้งหมด
        const organizations = await readOnlyContract.getAllOrganizations();

        if (organizations.length === 0) {
            FOUNDATION_CARD_GRID.innerHTML = '<p>ไม่พบมูลนิธิที่ลงทะเบียนในระบบ</p>';
            return;
        }

        let htmlContent = '';
        organizations.forEach(org => {
            // สมมติว่า organizations เป็น Array ของ Object ที่มี field name และ walletAddr
            htmlContent += createFoundationCard(org.name, org.walletAddr);
        });

        // แทรก Card เข้าไปใน HTML
        FOUNDATION_CARD_GRID.innerHTML = htmlContent;
        
    } catch (error) {
        console.error("Error loading foundations:", error);
        FOUNDATION_CARD_GRID.innerHTML = `<p style="color:red;">❌ เกิดข้อผิดพลาดในการดึงข้อมูลมูลนิธิ: ${error.message || 'กรุณาตรวจสอบการตั้งค่า Contract หรือ RPC Provider'}</p>`;
    }
}

// เริ่มโหลดข้อมูลเมื่อหน้าเว็บโหลดเสร็จสิ้น
window.onload = loadAllFoundations;