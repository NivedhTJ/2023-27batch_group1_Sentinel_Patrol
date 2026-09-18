from sqlmodel import Session, select
from database import engine, create_db_and_tables
from models import User, Incident
import bcrypt

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def seed_data():
    print("Ensuring database and tables are created...")
    create_db_and_tables()

    with Session(engine) as session:
        # Check if the sample officer already exists
        admin_badge = "SO-001"
        existing_user = session.exec(select(User).where(User.badge_number == admin_badge)).first()
        
        if not existing_user:
            admin_user = User(
                badge_number=admin_badge,
                name="Inspector Rajeev Kumar",
                password_hash=get_password_hash("SentinelSecure2026"),
                role="Circle Inspector",
                station_id=101
            )
            session.add(admin_user)
            session.commit()
            session.refresh(admin_user)
            print(f"Created Circle Inspector: {admin_user.name} (Badge: {admin_user.badge_number}, ID: {admin_user.id})")
            reporter_id = admin_user.id
        else:
            if existing_user.role == "Station Officer":
                existing_user.role = "Circle Inspector"
                session.add(existing_user)
                session.commit()
            print(f"Admin user exists: {existing_user.name} (Role: {existing_user.role}, ID: {existing_user.id})")
            reporter_id = existing_user.id

        # Seed additional users across various ranks
        additional_users = [
            {"badge": "PC-101", "name": "Constable Anish Nair", "role": "Constable"},
            {"badge": "SI-102", "name": "Sub-Inspector Priya Ramesh", "role": "Sub-Inspector"},
            {"badge": "SP-103", "name": "Superintendent Vikram Seth", "role": "Superintendent of Police"},
            {"badge": "DGP-104", "name": "DGP Madhavan Pillai", "role": "Director General of Police"},
        ]
        for u_data in additional_users:
            usr = session.exec(select(User).where(User.badge_number == u_data["badge"])).first()
            if not usr:
                new_u = User(
                    badge_number=u_data["badge"],
                    name=u_data["name"],
                    password_hash=get_password_hash("SentinelSecure2026"),
                    role=u_data["role"],
                    station_id=101
                )
                session.add(new_u)
                session.commit()
                print(f"Seeded user: {new_u.name} ({new_u.role}, Badge: {new_u.badge_number})")

        # Check and seed sample incidents in Kerala (Kochi, Kozhikode, Thiruvananthapuram)
        existing_incidents = session.exec(select(Incident)).all()
        if not existing_incidents:
            sample_incidents = [
                Incident(
                    title="Traffic Congestion & Road Blockage",
                    description="Heavy container breakdown causing major block near MG Road, Kochi.",
                    latitude=9.9312,
                    longitude=76.2673,
                    district="Ernakulam",
                    status="Reported",
                    reported_by=reporter_id
                ),
                Incident(
                    title="Unauthorized Beach Vendor Dispute",
                    description="Clash between local street vendors on Kozhikode Beach walkway.",
                    latitude=11.2588,
                    longitude=75.7804,
                    district="Kozhikode",
                    status="Investigating",
                    reported_by=reporter_id
                ),
                Incident(
                    title="Water Logging after Heavy Rain",
                    description="Severely flooded underpass near East Fort area, Thiruvananthapuram.",
                    latitude=8.5241,
                    longitude=76.9366,
                    district="Thiruvananthapuram",
                    status="Resolved",
                    reported_by=reporter_id
                )
            ]
            for inc in sample_incidents:
                session.add(inc)
            session.commit()
            print("Successfully seeded 3 sample incidents in Kerala (Kochi, Kozhikode, Thiruvananthapuram).")
        else:
            print(f"Incidents table already contains {len(existing_incidents)} records, skipping incident seeding.")

if __name__ == "__main__":
    seed_data()
