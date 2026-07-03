// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Memorial NFT (Decision 063): Polygon PoS / ERC-721.
/// - token id derives from the memorial UUID (uint256 of its 128 bits)
/// - minting an EXISTING id reverts — the pipeline's crash-safe re-mint
///   guarantee depends on this
/// - freely transferable; nothing in the game ever reads transfers back
/// v1.0 minimal implementation; consider an audited OpenZeppelin build for
/// mainnet if the owner wants metadata extensions.
contract SevenDaysMemorial {
    string public constant name = "Seven Days Derby Memorial";
    string public constant symbol = "SDDM";

    address public owner;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed approver, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed holder, address indexed operator, bool approved);

    constructor() {
        owner = msg.sender;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address holder = _owners[tokenId];
        require(holder != address(0), "NOT_MINTED");
        return holder;
    }

    function exists(uint256 tokenId) external view returns (bool) {
        return _owners[tokenId] != address(0);
    }

    function mint(address to, uint256 tokenId) external {
        require(msg.sender == owner, "OWNER_ONLY");
        require(to != address(0), "ZERO_ADDRESS");
        require(_owners[tokenId] == address(0), "ALREADY_MINTED");
        _owners[tokenId] = to;
        balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(to != address(0), "ZERO_ADDRESS");
        require(_owners[tokenId] == from, "WRONG_FROM");
        require(
            msg.sender == from || msg.sender == getApproved[tokenId] || isApprovedForAll[from][msg.sender],
            "NOT_AUTHORIZED"
        );
        delete getApproved[tokenId];
        unchecked {
            balanceOf[from] -= 1;
        }
        balanceOf[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    function approve(address approved, uint256 tokenId) external {
        address holder = ownerOf(tokenId);
        require(msg.sender == holder || isApprovedForAll[holder][msg.sender], "NOT_AUTHORIZED");
        getApproved[tokenId] = approved;
        emit Approval(holder, approved, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x01ffc9a7; // ERC721 / ERC165
    }
}
