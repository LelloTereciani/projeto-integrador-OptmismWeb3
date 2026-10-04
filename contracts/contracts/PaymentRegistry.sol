// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {MockUSD} from "./MockUSD.sol";

contract PaymentRegistry {
    using SafeERC20 for IERC20;

    enum PaymentState {
        Created,
        Approved,
        Settled
    }

    struct Payment {
        address payer;
        address beneficiary;
        uint256 amount;
        bytes32 termsHash;
        PaymentState state;
    }

    error InvalidBeneficiary();
    error InvalidToken(address tokenAddress);
    error InvalidAmount();
    error PaymentAlreadyExists(bytes32 paymentId);
    error PaymentNotFound(bytes32 paymentId);
    error UnauthorizedPayer(address caller);
    error InvalidPaymentState(bytes32 paymentId, PaymentState expected, PaymentState actual);

    event PaymentCreated(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed beneficiary,
        uint256 amount,
        bytes32 termsHash
    );
    event PaymentApproved(bytes32 indexed paymentId, address indexed payer);
    event PaymentSettled(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed beneficiary,
        uint256 amount
    );

    MockUSD public immutable token;
    mapping(bytes32 paymentId => Payment payment) public payments;

    constructor(address tokenAddress) {
        if (tokenAddress.code.length == 0) revert InvalidToken(tokenAddress);
        token = MockUSD(tokenAddress);
    }

    function createPayment(bytes32 paymentId, address beneficiary, uint256 amount, bytes32 termsHash) external {
        if (beneficiary == address(0) || beneficiary == msg.sender) revert InvalidBeneficiary();
        if (amount == 0) revert InvalidAmount();
        if (payments[paymentId].payer != address(0)) revert PaymentAlreadyExists(paymentId);

        payments[paymentId] = Payment({
            payer: msg.sender,
            beneficiary: beneficiary,
            amount: amount,
            termsHash: termsHash,
            state: PaymentState.Created
        });

        emit PaymentCreated(paymentId, msg.sender, beneficiary, amount, termsHash);
    }

    function approvePayment(bytes32 paymentId) external {
        Payment storage payment = _payerPayment(paymentId);
        _requireState(paymentId, payment, PaymentState.Created);

        payment.state = PaymentState.Approved;
        emit PaymentApproved(paymentId, payment.payer);
    }

    function settlePayment(bytes32 paymentId) external {
        Payment storage payment = _payerPayment(paymentId);
        _requireState(paymentId, payment, PaymentState.Approved);

        payment.state = PaymentState.Settled;
        IERC20(address(token)).safeTransferFrom(payment.payer, payment.beneficiary, payment.amount);

        emit PaymentSettled(paymentId, payment.payer, payment.beneficiary, payment.amount);
    }

    function _payerPayment(bytes32 paymentId) private view returns (Payment storage payment) {
        payment = payments[paymentId];
        if (payment.payer == address(0)) revert PaymentNotFound(paymentId);
        if (payment.payer != msg.sender) revert UnauthorizedPayer(msg.sender);
    }

    function _requireState(bytes32 paymentId, Payment storage payment, PaymentState expected) private view {
        if (payment.state != expected) revert InvalidPaymentState(paymentId, expected, payment.state);
    }
}
