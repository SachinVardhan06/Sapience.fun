// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SapienceMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable sapienceToken;
    IERC20 public immutable paymentToken;
    uint256 public immutable sapiencePerPaymentUnit;
    uint256 private immutable scaleNumerator;
    uint256 private immutable scaleDenominator;

    event Bought(address indexed buyer, uint256 paymentAmount, uint256 sapienceAmount);
    event Sold(address indexed seller, uint256 sapienceAmount, uint256 paymentAmount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    constructor(
        address owner_,
        address sapienceToken_,
        address paymentToken_,
        uint256 sapiencePerPaymentUnit_
    ) Ownable(owner_) {
        require(sapienceToken_ != address(0), "Invalid sapience token");
        require(paymentToken_ != address(0), "Invalid payment token");
        require(sapiencePerPaymentUnit_ > 0, "Invalid rate");

        sapienceToken = IERC20(sapienceToken_);
        paymentToken = IERC20(paymentToken_);
        sapiencePerPaymentUnit = sapiencePerPaymentUnit_;

        uint8 sapienceDecimals = IERC20Metadata(sapienceToken_).decimals();
        uint8 paymentDecimals = IERC20Metadata(paymentToken_).decimals();

        if (sapienceDecimals >= paymentDecimals) {
            scaleNumerator = 10 ** (sapienceDecimals - paymentDecimals);
            scaleDenominator = 1;
        } else {
            scaleNumerator = 1;
            scaleDenominator = 10 ** (paymentDecimals - sapienceDecimals);
        }
    }

    function previewBuy(uint256 paymentAmount) public view returns (uint256) {
        if (paymentAmount == 0) {
            return 0;
        }

        return (paymentAmount * sapiencePerPaymentUnit * scaleNumerator) / scaleDenominator;
    }

    function previewSell(uint256 sapienceAmount) public view returns (uint256) {
        if (sapienceAmount == 0) {
            return 0;
        }

        return (sapienceAmount * scaleDenominator) / (sapiencePerPaymentUnit * scaleNumerator);
    }

    function buy(uint256 paymentAmount) external nonReentrant {
        require(paymentAmount > 0, "Amount must be > 0");

        uint256 sapienceAmount = previewBuy(paymentAmount);
        require(sapienceAmount > 0, "Output too small");
        require(
            sapienceToken.balanceOf(address(this)) >= sapienceAmount,
            "Insufficient market sapience liquidity"
        );

        paymentToken.safeTransferFrom(msg.sender, address(this), paymentAmount);
        sapienceToken.safeTransfer(msg.sender, sapienceAmount);

        emit Bought(msg.sender, paymentAmount, sapienceAmount);
    }

    function sell(uint256 sapienceAmount) external nonReentrant {
        require(sapienceAmount > 0, "Amount must be > 0");

        uint256 paymentAmount = previewSell(sapienceAmount);
        require(paymentAmount > 0, "Output too small");
        require(
            paymentToken.balanceOf(address(this)) >= paymentAmount,
            "Insufficient market payment liquidity"
        );

        sapienceToken.safeTransferFrom(msg.sender, address(this), sapienceAmount);
        paymentToken.safeTransfer(msg.sender, paymentAmount);

        emit Sold(msg.sender, sapienceAmount, paymentAmount);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }
}
