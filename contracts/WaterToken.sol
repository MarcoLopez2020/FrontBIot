// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract WaterToken is ERC20, Ownable {
    mapping(address => bool) private minters;

    constructor() ERC20("WaterToken", "wtr") Ownable(msg.sender) {}

    modifier onlyMinter(address _sender) {
        require(minters[_sender], "No eres minero");
        _;
    }
    // mint tokens
    function mint(address _to) external onlyMinter(tx.origin) {
        _mint(_to, 1);
    }

    //add minero
    function addMinter(address _minter) external {
        require(owner() == tx.origin, "No puedes add nuevos minters");
        minters[_minter] = true;
    }
}