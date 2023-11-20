mod types;
mod interfaces;

contract dex {
    use dep::aztec::{
        context::{PrivateContext, PublicContext, Context},
        state_vars::{public_state::PublicState},
        types::type_serialization::field_serialization::{
            FieldSerializationMethods, FIELD_SERIALIZED_LEN,
        },
        types::type_serialization::aztec_address_serialization::{
            AztecAddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN
        },
        types::address::{AztecAddress},
        selector::compute_selector,
    };
    use dep::safe_math::SafeU120;
    use crate::interfaces::Token;
    use crate::types::{
            safe_u120_serialization::{SafeU120SerializationMethods, SAFE_U120_SERIALIZED_LEN}
        };

    struct Storage {
        owner: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,

        token0: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,
        token1: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,

        reserve0: PublicState<Field, FIELD_SERIALIZED_LEN>,
        reserve1: PublicState<Field, FIELD_SERIALIZED_LEN>,

        kLast: PublicState<Field, FIELD_SERIALIZED_LEN>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                owner: PublicState::new(
                    context,
                    1,
                    AztecAddressSerializationMethods,
                ),

                token0: PublicState::new(
                    context,
                    2,
                    AztecAddressSerializationMethods,
                ),
                token1: PublicState::new(
                    context,
                    3,
                    AztecAddressSerializationMethods,
                ),

                reserve0: PublicState::new(
                    context,
                    4,
                    FieldSerializationMethods,
                ),
                reserve1: PublicState::new(
                    context,
                    5,
                    FieldSerializationMethods,
                ),

                kLast: PublicState::new(
                    context,
                    6,
                    FieldSerializationMethods,
                ),
            }
        }
    }

    #[aztec(private)]
    fn constructor(owner: AztecAddress) {
        let selector = compute_selector("_initialize(Field)");
        context.call_public_function(context.this_address(), selector, [owner.address]);
    }

    #[aztec(public)]
    internal fn _initialize(
        owner: Field,
    ) {
        assert(owner != 0, "invalid address");
        storage.owner.write(AztecAddress::new(owner));
    }

    #[aztec(public)]
    fn create(
        token0_: AztecAddress,
        token1_: AztecAddress,
        reserve0_: Field,
        reserve1_: Field,
        nonce_for_transfer0_: Field,
        nonce_for_transfer1_: Field
    ) {
        assert(storage.owner.read().address == context.msg_sender(), "Sender is not the owner.");
        assert((storage.reserve0.read() == 0) & (storage.reserve1.read() == 0), "Token pair exists.");

        Token::at(token0_.address).transfer_public(
            context,
            context.msg_sender(),
            context.this_address(),
            reserve0_,
            nonce_for_transfer0_,
        );
        Token::at(token1_.address).transfer_public(
            context,
            context.msg_sender(),
            context.this_address(),
            reserve1_,
            nonce_for_transfer1_,
        );

        storage.token0.write(token0_);
        storage.token1.write(token1_);

        storage.reserve0.write(reserve0_);
        storage.reserve1.write(reserve1_);

        storage.kLast.write(reserve0_ * reserve1_);
    }

    #[aztec(public)]
    fn swap(
        token_in_: AztecAddress,
        amount_in_: Field,
        nonce_for_transfer_: Field,
    ) {
        assert(token_in_.eq(storage.token0.read()) | token_in_.eq(storage.token1.read()), "Token address is incorrect");

        if (token_in_.eq(storage.token0.read())) {
            let new_reserve0 = storage.reserve0.read() + amount_in_;
            let new_reserve1 = serializeU120(SafeU120::new(storage.kLast.read()).div(SafeU120::new(new_reserve0)))[0];
            let amount_out = storage.reserve1.read() - new_reserve1;

            Token::at(token_in_.address).transfer_public(
               context,
               context.msg_sender(),
               context.this_address(),
               amount_in_,
               nonce_for_transfer_,
            );
            storage.reserve0.write(new_reserve0);

            Token::at(storage.token1.read().address).transfer_public(
                context,
                context.this_address(),
                context.msg_sender(),
                amount_out,
                0,
            );
            storage.reserve1.write(new_reserve1);
        } else {
            let new_reserve1 = storage.reserve1.read() + amount_in_;
            let new_reserve0 = serializeU120(SafeU120::new(storage.kLast.read()).div(SafeU120::new(new_reserve1)))[0];
            let amount_out = storage.reserve0.read() - new_reserve0;

            Token::at(token_in_.address).transfer_public(
                context,
                context.msg_sender(),
                context.this_address(),
                amount_in_,
                nonce_for_transfer_,
            );
            storage.reserve1.write(new_reserve1);

            Token::at(storage.token0.read().address).transfer_public(
                context,
                context.this_address(),
                context.msg_sender(),
                amount_out,
                0,
            );
            storage.reserve0.write(new_reserve0);
        }
    }

    unconstrained fn test(
        token_in_: AztecAddress,
        amount_in_: Field,
        nonce_for_transfer_: Field,
    ) -> [Field; 5] {
        let new_reserve0 = storage.reserve0.read() + amount_in_;
        let new_reserve1 = serializeU120(SafeU120::new(storage.kLast.read()).div(SafeU120::new(new_reserve0)))[0];
        let amount_out = storage.reserve1.read() - new_reserve1;

        [storage.reserve0.read(), storage.reserve1.read(), new_reserve0, new_reserve1, amount_out]
    }

    unconstrained fn get_reserves() -> [Field; 2] {
       [storage.reserve0.read(), storage.reserve1.read()]
    }

    unconstrained fn compute_note_hash_and_nullifier(
        contract_address: Field,
        nonce: Field,
        storage_slot: Field,
        serialized_note: [Field; 0]) -> [Field; 4] {
        [0, 0, 0, 0]
    }

    unconstrained fn serializeU120(value: SafeU120) -> [Field; SAFE_U120_SERIALIZED_LEN] {
        [value.value as Field]
    }
}