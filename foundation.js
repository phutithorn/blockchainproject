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
    // กำหนดประเภทแท็กให้เป็น E-DONATION เสมอ (กำกับประเภทมูลนิธิ)
    let tagClass = 'e-donation';
    let tagName = 'E-DONATION'; 
    
    // ***** ส่วนที่แก้ไข: ใส่ address ของมูลนิธิใน URL ผ่าน query parameter *****
    return `
        <div class="foundation-card">
            <div class="foundation-info">
                <h3>${orgName}</h3>
                <p class="tag ${tagClass}">${tagName}</p>
            </div>
            <!-- ปุ่มกดเพื่อไปยังหน้า index พร้อมแนบ address ของมูลนิธิ -->
            <a href="index.html?donateOrg=${orgAddress}" class="btn-donate">บริจาคเลย</a>
        </div>
    `;
}

/**
 * ฟังก์ชันโหลดข้อมูลมูลนิธิทั้งหมดจาก Smart Contract
 * - ตรวจสอบ provider (มี MetaMask หรือไม่)
 * - ดึงข้อมูลจาก contract
 * - สร้าง Card สำหรับแต่ละมูลนิธิ
 */
async function loadAllFoundations() {
    if (!FOUNDATION_CARD_GRID) return; // หากไม่พบ element ให้หยุด

    // ตรวจสอบว่า Ethers.js โหลดสำเร็จหรือไม่
    if (!window.ethers) {
        FOUNDATION_CARD_GRID.innerHTML = '<p style="color:red;">❌ Ethers.js ไม่ถูกโหลด กรุณาตรวจสอบแท็ก script ใน HTML</p>';
        return;
    }
    
    // แสดงข้อความกำลังโหลด
    FOUNDATION_CARD_GRID.innerHTML = '<p id="loadingMessage">⏳ กำลังเชื่อมต่อและโหลดข้อมูลมูลนิธิ...</p>';
    
    try {
        let provider;
        
        // ถ้ามี MetaMask ให้ใช้ BrowserProvider
        if (window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
        } else {
            // หากไม่มี Wallet ให้ fallback ใช้ Public RPC เพื่ออ่านข้อมูลเท่านั้น
            FOUNDATION_CARD_GRID.innerHTML = '<p style="color:orange;">⚠️ ไม่พบ Wallet (MetaMask) กำลังพยายามใช้ Public RPC Provider...</p>';
            
            // *** หมายเหตุ: ต้องเปลี่ยน YOUR_NETWORK_RPC_URL เป็น RPC ของเครือข่ายที่ใช้จริง ***
            provider = new ethers.JsonRpcProvider("YOUR_NETWORK_RPC_URL");
        }

        // สร้าง instance ของ smart contract ใช้สำหรับอ่านข้อมูล
        const readOnlyContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        
        // ดึงข้อมูลมูลนิธิทั้งหมดจากฟังก์ชัน getAllOrganizations
        const organizations = await readOnlyContract.getAllOrganizations();

        // ถ้าไม่มีข้อมูล ให้แจ้งผู้ใช้
        if (organizations.length === 0) {
            FOUNDATION_CARD_GRID.innerHTML = '<p>ไม่พบมูลนิธิที่ลงทะเบียนในระบบ</p>';
            return;
        }

        let htmlContent = '';

        // วนลูปสร้าง Card สำหรับมูลนิธิแต่ละรายการ
        organizations.forEach(org => {
            // สมมติว่ามี field org.name และ org.walletAddr
            htmlContent += createFoundationCard(org.name, org.walletAddr);
        });

        // นำ HTML ทั้งหมดไปแสดงบนหน้าเว็บ
        FOUNDATION_CARD_GRID.innerHTML = htmlContent;
        
    } catch (error) {
        console.error("Error loading foundations:", error);

        // หากมี error ให้แสดงข้อความอธิบาย
        FOUNDATION_CARD_GRID.innerHTML = `
            <p style="color:red;">
                ❌ เกิดข้อผิดพลาดในการดึงข้อมูลมูลนิธิ: ${error.message || 'กรุณาตรวจสอบการตั้งค่า Contract หรือ RPC Provider'}
            </p>`;
    }
}

// เริ่มโหลดข้อมูลทันทีที่หน้าเว็บโหลดเสร็จ
window.onload = loadAllFoundations;