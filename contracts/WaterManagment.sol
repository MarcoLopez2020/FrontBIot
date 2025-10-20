// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import "./WaterToken.sol";

contract WaterManagement is Ownable, AccessControl {

    uint private requestId;
    address[] private entities;
    mapping(address => int) private saved;
    mapping(address => uint[]) private companyToRequest;
    mapping(address => uint[]) private govToRequest;
    mapping(address => string[]) private companyToSensorIds;
    mapping(address => Entity) private addressToEntityData;
    mapping(uint => Request) private requestIdToRequest;
    mapping(address => Site[]) private companyToSites;
    mapping(address => SensorData[]) private companyToSensorData;


    bytes32 public constant COMPANY_ROLE = keccak256("COMPANY");
    bytes32 public constant GOVERNMENT_ROLE = keccak256("GOVERNMENT");
    WaterToken waterToken;

    struct Entity {
        address entity;
        string name;
        string nif;
    }

    struct Request {
        uint id;
        address company;
        address gov;
        bool answered;
        Status status;
    }

    struct Site{
        string siteId;
        string latitude;
        string longitude;
        uint benchmark;
    }

    
    struct SensorData{
        string sensorId;
        string siteId;
        uint value;
        uint timestamp;
    }

    enum Status {
        PENDING,
        APPROVED,
        DENIED
    }

    
    event EntityAdded(address indexed entity);
    event DataRequested(address indexed company, address indexed government);
    event PushData(address indexed company, string indexed sensorId);


    constructor(address _waterAddress) Ownable(msg.sender) {
        waterToken = WaterToken(_waterAddress);
        requestId = 1;
    }

    modifier onlyCompany(address _company) {
        require(
            hasRole(COMPANY_ROLE, _company),
            "La direecion no es el rol de Company"
        );
        _;
    }

        modifier onlyGovernment(address _government) {
        require(
            hasRole(GOVERNMENT_ROLE, _government),
            "La direecion no es GOVERNMENT"
        );
        _;
    }

    function addEntity(
        address _entityAddress,
        string calldata _name,
        string calldata _nif,
        string calldata _role
    ) external onlyOwner {
        require(
            owner() != _entityAddress,
            "La direecion no es la misama qie el owner del contrato"
        );
        Entity memory entity = Entity(_entityAddress, _name, _nif);
        addressToEntityData[_entityAddress] = entity;

        if (Strings.equal(_role, "company")) {
            waterToken.addMinter(_entityAddress);
            _grantRole(COMPANY_ROLE, _entityAddress);
        }
        if (Strings.equal(_role, "government")) {
            _grantRole(GOVERNMENT_ROLE, _entityAddress);
        }

        entities.push(_entityAddress);
        emit EntityAdded(_entityAddress);
    }

    function fetchEntities() external view returns (Entity[] memory) {
        require(
            hasRole(GOVERNMENT_ROLE, msg.sender) ||
                hasRole(COMPANY_ROLE, msg.sender),
            "La entidad no tiene rol"
        );

        Entity[] memory data = new Entity[](entities.length);
        // IF GOVERNMENT ROLE, RETURN ALL COMPANY ACCOUNTS
        if (hasRole(GOVERNMENT_ROLE, msg.sender)) {
            for (uint i = 0; i < entities.length; i++) {
                if (hasRole(COMPANY_ROLE, entities[i])) {
                    (
                        address entity,
                        string memory name,
                        string memory nif
                    ) = fetchEntityData(entities[i]);
                    data[i] = Entity(entity, name, nif);
                }
            }
        }

        // IF COMPANY ROLE, RETURN ONLY THEIR ACCOUNT
        if (hasRole(COMPANY_ROLE, msg.sender)) {
            for (uint i = 0; i < entities.length; i++) {
                if (hasRole(GOVERNMENT_ROLE, entities[i])) {
                    (
                        address entity,
                        string memory name,
                        string memory nif
                    ) = fetchEntityData(entities[i]);
                    data[i] = Entity(entity, name, nif);
                }
            }
        }
        return data;
    }

    function fetchEntityData(
        address _entity
    ) public view returns (address, string memory, string memory) {
        return (
            addressToEntityData[_entity].entity,
            addressToEntityData[_entity].name,
            addressToEntityData[_entity].nif
        );
    }

    function createRequest(
        address _company
    ) external onlyGovernment(msg.sender) returns (bool) {
        Request memory request = Request(
            requestId,
            _company,
            msg.sender,
            false,
            Status.PENDING
        );
        requestIdToRequest[requestId] = request;
        companyToRequest[_company].push(requestId);
        govToRequest[msg.sender].push(requestId);
        requestId += 1;
        emit DataRequested(_company, msg.sender);
        return true;
    }
    function answerRequest(uint _requestld, string calldata _newStatus) external onlyCompany(msg.sender){
        if (Strings.equal(_newStatus, "aprovado" )){
            requestIdToRequest [_requestld].status = Status.APPROVED;
        }else {
            requestIdToRequest[_requestld].status= Status.DENIED;
        }
        requestIdToRequest[_requestld].answered = true;
    }
    
    function checkRequestExists(address _government, address _company) public view  returns(uint){
        require(hasRole(GOVERNMENT_ROLE, _government),"Debe tener un rol de Givierno");
        uint[] memory ids = govToRequest[_government];
           for (uint i = 0; i < ids.length; i++) {
                if (requestIdToRequest[ids[i]].company == _company && requestIdToRequest[ids[i]].gov == _government) {
                    return ids[i];
                }
            }
        return 0;
    }

    function fetchRequestStatus(uint _requestId) external view onlyGovernment(msg. sender) returns(Status){
    return requestIdToRequest[_requestId].status;
    }

    function fetchRequests() external view onlyCompany (msg.sender) returns (Request[] memory){
        Request[] memory requests = new Request[] (companyToRequest [msg. sender] . length);
        uint[] memory ids = companyToRequest[msg.sender] ;
        for (uint i = 0; i < ids.length; i++) {
            requests [i] = requestIdToRequest[ids[i]];
        }
       return requests;
    }

    function fetchRequestData(uint _requestId) external view returns (address, address, bool, Status) {
        return (
        requestIdToRequest [_requestId].company,
        requestIdToRequest [_requestId].gov,
        requestIdToRequest [_requestId].answered,
        requestIdToRequest [_requestId].status    
        );
    }

    function registerSensor(string calldata _sensorId) external onlyCompany(msg.sender) {
        companyToSensorIds[msg.sender].push(_sensorId) ;
    }

    function registerSite(string calldata _siteId, string calldata _latitude, string calldata _longitude, uint _benchmark) external onlyCompany(msg.sender) {
         companyToSites[msg.sender].push(Site( _siteId, _latitude, _longitude, _benchmark));
    }

    function pushData (string calldata _sensorId, string calldata _siteId, uint _value, uint _timestamp) external onlyCompany(msg.sender) returns(bool)  {
        require (bytes ( _sensorId).length > 0, "Los datos del ID del sensor no pueden ser NULL" ) ;
        require (bytes ( _siteId).length > 0, "Los datos del ID sitio no pueden ser   NULL" ) ;
        require(_value >= 0, "Los litros de agua deben ser 0 o mas");
       require(_timestamp > 0, "Tiempo no puede ser 0");
        require(checkSensorIdToCompany(_sensorId, msg. sender) ,"Este ID de sensor no pertenece a la empresa");
        require(fetchBenchmark(_siteId, msg. sender)!= 0, "Este ID de site no pertenece a la empresa");

        uint benchmark = fetchBenchmark(_siteId, msg.sender);
            SensorData memory sensorData = SensorData(_sensorId, _siteId, _value, _timestamp);
            companyToSensorData[msg.sender].push(sensorData) ;
            mintToken(msg. sender, _value, benchmark);
            emit PushData(msg. sender, _sensorId) ;
        return true;
    }

    function checkSensorIdToCompany(string calldata _sensorId, address _company) private view returns (bool) {
        string[] memory ids = companyToSensorIds[_company];
        for (uint i = 0; i < ids.length; i++){
          if (Strings.equal(ids[i], _sensorId)) {
            return true;  
            }
        }
        return false;
    }

        function fetchBenchmark(string calldata _siteId, address _company) private view returns (uint) {
        Site[] memory sites = companyToSites[_company];
        for (uint i = 0; i < sites.length; i++){
          if (Strings.equal(sites[i].siteId, _siteId)) {
            return sites[i].benchmark;  
            }
        }
        return 0;
    }

        function mintToken(address _company, uint _value, uint _benchmark) private {
        if (_value < _benchmark){
            saved[_company] += int (_benchmark - _value) ;
        }else {
            saved[_company] -= int (_value - _benchmark) ;
        }
        if ( saved[_company] >= int(_benchmark)) {
            waterToken. mint(_company);
            saved[_company] -= int(_benchmark);
        }
    }
    
    function pullDataByCompany() external view onlyCompany(msg.sender) returns(SensorData[] memory) {
        return fetchData(msg. sender);
    }

    function pullDataByGovernment(address _company) external view onlyGovernment(msg.sender) returns(SensorData[] memory) {
        require(checkRequestApproval(msg.sender, _company), "No tiene permiso para solicitar estos datos");
        return fetchData(_company);
    }

    function fetchData(address _company) private view returns(SensorData[] memory){
        SensorData[] memory data = new SensorData[] (companyToSensorData[_company].length);
            for (uint i = 0; i < companyToSensorData[_company].length; i++){
            data[i] = SensorData(
                companyToSensorData[_company][i].sensorId,
                companyToSensorData[_company][i].siteId,
                companyToSensorData[_company][i].value,
                companyToSensorData[_company][i].timestamp
                );
            }
        return data;
    }

    function checkRequestApproval (address _government, address _company) private view returns (bool){
        uint reqId = checkRequestExists(_government, _company) ;
        require(reqId != 0, "No existe ninguna solicitud");
        if (requestIdToRequest[reqId].status == Status.APPROVED) {
            return true;
    }

    return false;
    }

    function fecthSaved() external view returns (int ){
        return saved[msg.sender];
    }

    function fetchSites() external view onlyCompany(msg.sender) returns(Site[] memory) {
        return companyToSites[msg. sender];
    }

    function checkRole() external view returns (int){
        if (owner() == msg.sender) {
            return 0;
        } else if (hasRole(GOVERNMENT_ROLE, msg.sender)){
             return 1;
        } else if (hasRole(COMPANY_ROLE, msg.sender)) {
            return 2;
        }else{
            return -1;
        }
    }

}