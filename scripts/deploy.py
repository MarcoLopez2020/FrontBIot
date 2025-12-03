from brownie import accounts, network, WaterToken, WaterManagement, web3
import os
from dotenv import load_dotenv


def get_account_from_env(env_var: str):
    pk = os.getenv(env_var)
    if not pk:
        raise ValueError(f"Env var {env_var} no encontrada. Revisa tu .env")

    if not pk.startswith("0x"):
        pk = "0x" + pk

    acct = accounts.add(pk)
    return acct


def main():
    load_dotenv()

    print("=== Deploy Sistema Biot en BiotChain ===")
    print("Network activa:", network.show_active())

    # 1) Deployer = OWNER (admin del sistema)
    deployer = get_account_from_env("PRIVATE_KEY_OWNER")
    print(f"Deployer (OWNER/admin): {deployer.address}")
    print(f"Balance deployer: {deployer.balance()} wei")

    # Gas legacy fijo (1 gwei) para evitar baseFeePerGas
    gas_price = web3.to_wei(1, "gwei")
    common_tx = {"from": deployer, "gas_price": gas_price}

    # 2) Deploy WaterToken
    print("\n>> Deploying WaterToken...")
    wt = WaterToken.deploy(common_tx)
    print(f"WaterToken deployed at: {wt.address}")

    # 3) Deploy WaterManagement(token)
    print("\n>> Deploying WaterManagement...")
    wm = WaterManagement.deploy(wt.address, common_tx)
    print(f"WaterManagement deployed at: {wm.address}")

    # 4) setController(token → wm)
    print("\n>> Setting controller (WaterToken -> WaterManagement)...")
    tx_ctrl = wt.setController(wm.address, common_tx)
    tx_ctrl.wait(1)
    print("setController tx hash:", tx_ctrl.txid)

    # 5) Asignar roles (COMPANY, GOVERNMENT) a las cuentas del .env
    company_addr = os.getenv("PUBLIC_KEY_COMPANY_A")
    government_addr = os.getenv("PUBLIC_KEY_GOVERNMENT")

    print("\n>> Asignando roles de AccessControl...")

    # COMPANY_ROLE
    try:
        company_role = wm.COMPANY_ROLE()
        print("   COMPANY_ROLE:", company_role)
        if company_addr:
            tx_company = wm.grantRole(company_role, company_addr, common_tx)
            tx_company.wait(1)
            print(f"   ✔ COMPANY_ROLE asignado a {company_addr}")
        else:
            print("   ⚠ PUBLIC_KEY_COMPANY_A no definido en .env")
    except Exception as ex:
        print("   ⚠ No se pudo asignar COMPANY_ROLE:", ex)

    # GOVERNMENT_ROLE (si existe en el contrato)
    try:
        government_role = wm.GOVERNMENT_ROLE()
        print("   GOVERNMENT_ROLE:", government_role)
        if government_addr:
            tx_gov = wm.grantRole(government_role, government_addr, common_tx)
            tx_gov.wait(1)
            print(f"   ✔ GOVERNMENT_ROLE asignado a {government_addr}")
        else:
            print("   ⚠ PUBLIC_KEY_GOVERNMENT no definido en .env")
    except Exception as ex:
        print("   ⚠ No se pudo asignar GOVERNMENT_ROLE (omitido):", ex)

    # 6) Info básica del token
    try:
        print("\n=== WaterToken Info ===")
        print("Name     :", wt.name())
        print("Symbol   :", wt.symbol())
        print("Decimals :", wt.decimals())
        print("TotalSup :", wt.totalSupply())
    except Exception as ex:
        print("\n[WARN] No se pudo leer name/symbol/decimals/totalSupply:")
        print(ex)

    print("\n✅ Sistema desplegado y conectado correctamente.")
    print("   WaterToken:      ", wt.address)
    print("   WaterManagement: ", wm.address)
    print("\n💡 Copia estas líneas en tu .env o config de backend:")
    print(f"WATERTOKEN_ADDRESS={wt.address}")
    print(f"WATERMANAGEMENT_ADDRESS={wm.address}")
