// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DonationSystem is ERC20 {

    // --- Owner ---
    address private immutable _owner;
    modifier onlyOwner() { require(msg.sender == _owner, "Not owner"); _; }
    function owner() public view returns (address) { return _owner; }

    // 1 Token = 0.0000097 ETH = 1 Baht
    uint256 constant TOKEN_PRICE_WEI = 9700000000000; 

    //โครงสร้างการเก็บข้อมูล
    struct Organization {
        string name;
        address walletAddr;
        bool isApproved;
        uint256 balance; 
        uint256 activeCampaignCount;
    }

    struct Campaign {
        uint256 id;
        address orgAddress;
        string title;
        uint256 targetAmount;
        uint256 raisedAmount;
        uint256 deadline;
        bool isEnded;
        uint256 listIndex;
    }

    // List Org
    address[] public orgList;
    mapping(address => Organization) public organizations;
    
    //ID แคมเปญที่ยังอยู่
    uint256[] public activeCampaignIds;
    mapping(uint256 => Campaign) public campaigns;
    uint256 public nextCampaignId;
    //event แจ้งเตือน เพิ่มบอกหน้าเว็บ 
    event OrganizationAdded(address indexed orgAddress, string name);
    event OrganizationRemoved(address indexed orgAddress);
    event DonationReceived(address indexed donor, address indexed orgAddress, uint256 amount);
    event FundsWithdrawn(address indexed orgAddress, uint256 dntAmount, uint256 ethAmount);
    event Buy(address indexed from, uint tokenAmount);

    event CampaignCreated(uint256 indexed id, string title, uint256 target, uint256 deadline);
    event CampaignDonation(uint256 indexed id, address indexed donor, uint256 amount);
    event CampaignClosed(uint256 indexed id, uint256 raised, uint256 ethValue);

    constructor() ERC20("Donation Token", "DNT") {
        _owner = msg.sender; 
        _mint(address(this), 1000000000 * 10**decimals());
    }

    // ซื้อ Token
    function buyTokens(uint256 amountToBuy) public payable {
        require(amountToBuy > 0, "Must buy > 0");
        uint256 requiredETH = amountToBuy * TOKEN_PRICE_WEI;
        require(msg.value >= requiredETH, "Not enough ETH");
        uint256 amountInBaseUnits = amountToBuy * (10**decimals());
        require(balanceOf(address(this)) >= amountInBaseUnits, "Stock empty");

        _transfer(address(this), msg.sender, amountInBaseUnits);
        
        if (msg.value > requiredETH) {
            (bool success, ) = msg.sender.call{value: msg.value - requiredETH}("");
            require(success, "Refund failed");
        }
        emit Buy(msg.sender, amountInBaseUnits);
    }


    //เพิ่ม Org
    function addOrganization(address _orgAddress, string memory _name) public onlyOwner {
        require(_orgAddress != address(0), "Invalid address");
        require(!organizations[_orgAddress].isApproved, "Already approved");

        organizations[_orgAddress] = Organization({
            name: _name,
            walletAddr: _orgAddress,
            isApproved: true,
            balance: 0,
            activeCampaignCount: 0
        });
        orgList.push(_orgAddress);
        emit OrganizationAdded(_orgAddress, _name);
    }
    // ลบ Org
    function removeOrganization(address _orgAddress) public onlyOwner {
        require(organizations[_orgAddress].isApproved, "Not found");
        require(organizations[_orgAddress].balance == 0, "Balance remaining");
        require(organizations[_orgAddress].activeCampaignCount == 0, "Active campaigns exist");
        
        delete organizations[_orgAddress];
        
        for (uint i = 0; i < orgList.length; i++) {
            if (orgList[i] == _orgAddress) {
                orgList[i] = orgList[orgList.length - 1];
                orgList.pop();
                break;
            }
        }
        emit OrganizationRemoved(_orgAddress);
    }

    // สร้างแคมเปญ
    function createCampaign(string memory _title, uint256 _targetAmount, uint256 _durationInDays) public {
        require(organizations[msg.sender].isApproved, "Not approved org");
        require(_targetAmount > 0, "Target > 0");
        require(_durationInDays > 0, "Duration > 0");

        organizations[msg.sender].activeCampaignCount++;

        nextCampaignId++;
        uint256 newId = nextCampaignId;

        //เพิ่มลง Active List
        activeCampaignIds.push(newId);
        uint256 index = activeCampaignIds.length - 1;

        campaigns[newId] = Campaign({
            id: newId,
            orgAddress: msg.sender,
            title: _title,
            targetAmount: _targetAmount * (10**decimals()),
            raisedAmount: 0,
            deadline: block.timestamp + (_durationInDays * 1 days),
            isEnded: false,
            listIndex: index
        });

        emit CampaignCreated(newId, _title, _targetAmount, campaigns[newId].deadline);
    }
    //Donate ไปแคมเปญ
    function donateToCampaign(uint256 _campaignId, uint256 amountToDonate) public {
        Campaign storage campaign = campaigns[_campaignId];
        
        require(campaign.id != 0, "Not found");
        require(!campaign.isEnded, "Ended");
        require(block.timestamp < campaign.deadline, "Expired");
        require(amountToDonate > 0, "Amount > 0");

        uint256 amountWei = amountToDonate * (10**decimals());
        require(balanceOf(msg.sender) >= amountWei, "Insufficient DNT");

        _transfer(msg.sender, address(this), amountWei);
        
        campaign.raisedAmount += amountWei;
        
        emit CampaignDonation(_campaignId, msg.sender, amountWei);
    }

    //ถอนเงินจากแคมเปญ เฉพาะ Org ที่สร้างแคมเปญ
    function withdrawCampaignFunds(uint256 _campaignId) public {
        Campaign storage campaign = campaigns[_campaignId];
        
        require(msg.sender == campaign.orgAddress, "Not owner");
        require(campaign.id != 0, "Not found"); 

        bool goalReached = campaign.raisedAmount >= campaign.targetAmount;
        bool timeUp = block.timestamp >= campaign.deadline;

        require(goalReached || timeUp, "Ongoing");
        
        uint256 raised = campaign.raisedAmount;
        address orgAddr = campaign.orgAddress;
        uint256 ethAmount = 0;

        if (raised > 0) {
            ethAmount = (raised * TOKEN_PRICE_WEI) / (10**decimals());
            require(address(this).balance >= ethAmount, "Low ETH");
            (bool success, ) = orgAddr.call{value: ethAmount}("");
            require(success, "Transfer failed");
        }

        //ขั้นตอนการลบ แคมเปญหลังจากถอนเงิน
        uint256 rowToDelete = campaign.listIndex;
        uint256 lastRowIndex = activeCampaignIds.length - 1;

        // ถ้าตัวที่จะลบไม่ใช่ตัวสุดท้ายให้เอาตัวสุดท้ายมาเสียบแทน
        if (rowToDelete != lastRowIndex) {
            uint256 lastCampaignId = activeCampaignIds[lastRowIndex];
            
            // ย้าย ID
            activeCampaignIds[rowToDelete] = lastCampaignId;
            // อัปเดต index ของแคมเปญที่ถูกย้ายมา
            campaigns[lastCampaignId].listIndex = rowToDelete;
        }

        // ลบ Id
        activeCampaignIds.pop();
        // ลบข้อมูลใน Mapping
        delete campaigns[_campaignId];

        if (organizations[msg.sender].activeCampaignCount > 0) {
            organizations[msg.sender].activeCampaignCount--;
        }

        emit CampaignClosed(_campaignId, raised, ethAmount);
    }

    //ดึงเฉพาะ Active Campaigns เท่านั้น
    function getAllCampaigns() public view returns (Campaign[] memory) {
        uint256 count = activeCampaignIds.length;
        Campaign[] memory allCampaigns = new Campaign[](count);
        
        for (uint i = 0; i < count; i++) {
            uint256 id = activeCampaignIds[i];
            allCampaigns[i] = campaigns[id];
        }
        return allCampaigns;
    }

    //ระบบบริจาค
    function donate(address _toOrganization, uint256 amountToDonate) public {
        require(organizations[_toOrganization].isApproved, "Org not approved");
        require(amountToDonate > 0, "Amount > 0");
        uint256 amountInBaseUnits = amountToDonate * (10**decimals());
        require(balanceOf(msg.sender) >= amountInBaseUnits, "Insufficient DNT");
        _transfer(msg.sender, address(this), amountInBaseUnits);
        organizations[_toOrganization].balance += amountInBaseUnits;
        emit DonationReceived(msg.sender, _toOrganization, amountInBaseUnits);
    }
    //ถอนเงินจากการบริจาคตรงๆ
    function withdrawFunds() public {
        address orgAddress = msg.sender;
        require(organizations[orgAddress].isApproved, "Not approved org");
        uint256 dntAmountWei = organizations[orgAddress].balance;
        require(dntAmountWei > 0, "No funds");
        uint256 ethAmount = (dntAmountWei * TOKEN_PRICE_WEI) / (10**decimals());
        require(address(this).balance >= ethAmount, "Contract low ETH");
        organizations[orgAddress].balance = 0;
        (bool success, ) = orgAddress.call{value: ethAmount}("");
        require(success, "Transfer failed");
        emit FundsWithdrawn(orgAddress, dntAmountWei, ethAmount);
    }

    //ถอนเศษเงินเหลือ เฉพาะ Admin
    function withdrawExcessETH() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH");
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Failed");
    }
    //ดูมูลนิธิ
    function getAllOrganizations() public view returns (Organization[] memory) {
        Organization[] memory allOrgs = new Organization[](orgList.length);
        for (uint i = 0; i < orgList.length; i++) {
            allOrgs[i] = organizations[orgList[i]];
        }
        return allOrgs;
    }
    // ปิด Transfer
    function transfer(address, uint256) public virtual override returns (bool) {
        revert("Transfers disabled.");
    }
    // ปิด TransferFrom
    function transferFrom(address, address, uint256) public virtual override returns (bool) {
        revert("Transfers disabled.");
    }
}